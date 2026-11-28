import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, UserRound } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { Field } from '#/components/ui/Field'
import { Input, Textarea } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { LOCALE_NAMES, LOCALES, type Locale } from '#/i18n/locales'
import { type AdminAuthor, type AdminAuthorList, AUTHOR_LIMITS, type AuthorSaved, type AuthorTranslation } from '#/shared/cmsTypes'
import { cmsCall, type CmsFailure } from './api'
import { ImageField } from './AssetsPage'
import { failureText } from './failures'
import { useAdminText } from './text'

type Load = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly list: AdminAuthorList }

/** `/admin/cms/authors` (docs/12 §9 "Yazarlar"): the profiles; editing replaces the list (one column on every width). */
export const AuthorsPage = () => {
  const { text } = useAdminText()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<AdminAuthor | 'new' | null>(null)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    void cmsCall<AdminAuthorList>('listAuthors').then((result) => {
      if (!cancelled) setLoad(result.ok ? { status: 'ready', list: result.data } : { status: 'error', failure: result })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (load.status === 'loading')
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  if (load.status === 'error') return <InlineAlert title={failureText(text, load.failure)} action={<Button onClick={reload}>{text.gate.retry}</Button>} />

  if (editing !== null)
    return (
      <AuthorForm
        key={editing === 'new' ? 'new' : editing.id}
        author={editing === 'new' ? null : editing}
        candidates={load.list.candidates}
        onDone={() => {
          setEditing(null)
          reload()
        }}
        onCancel={() => setEditing(null)}
      />
    )

  const { rows, candidates } = load.list
  return (
    <>
      <PageHeader
        title={text.authors.title}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')} {...(candidates.length === 0 ? { disabledReason: text.authors.noCandidates } : {})}>
            <Plus aria-hidden className="size-4" />
            {text.authors.newAuthor}
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={<UserRound />} title={text.authors.empty} />
      ) : (
        <ul className="grid gap-2">
          {rows.map((author) => (
            <li key={author.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
              <Avatar name={author.name} {...(author.avatar === null ? {} : { src: author.avatar.url })} size="md" decorative />
              <div className="grid min-w-0 flex-1 basis-48">
                <span className="font-medium text-text [overflow-wrap:anywhere]">{author.name}</span>
                <span className="text-sm text-text-2 [overflow-wrap:anywhere]">
                  {[author.translations.en?.jobTitle, author.slug === null ? null : `/authors/${author.slug}`, text.authors.posts(author.posts)].filter(Boolean).join(' · ')}
                </span>
                <span className="text-sm text-text-3 [overflow-wrap:anywhere]">{author.userEmail}</span>
              </div>
              <Button onClick={() => setEditing(author)}>{text.authors.edit}</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const emptyTranslations = (): Record<Locale, AuthorTranslation> => Object.fromEntries(LOCALES.map((l) => [l, { bio: '', jobTitle: '' }])) as Record<Locale, AuthorTranslation>

type FieldErrors = Partial<Record<string, string>>

/** Create or edit one author: account (new only), name, slug, avatar, profiles, and per-language job title and bio. */
const AuthorForm = ({ author, candidates, onDone, onCancel }: { author: AdminAuthor | null; candidates: AdminAuthorList['candidates']; onDone: () => void; onCancel: () => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const [userId, setUserId] = useState(author?.userId ?? candidates[0]?.userId ?? '')
  const [name, setName] = useState(author?.name ?? candidates[0]?.name ?? '')
  const [slug, setSlug] = useState(author?.slug ?? '')
  const [avatar, setAvatar] = useState<{ assetId: string | null; url: string } | null>(author?.avatar ?? null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [links, setLinks] = useState((author?.sameAs ?? []).join('\n'))
  const [translations, setTranslations] = useState<Record<Locale, AuthorTranslation>>(() => ({ ...emptyTranslations(), ...author?.translations }))
  const [locale, setLocale] = useState<Locale>('en')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const current = translations[locale]

  const setTranslation = (key: keyof AuthorTranslation, value: string) => setTranslations((all) => ({ ...all, [locale]: { ...all[locale], [key]: value } }))

  const fail = (failure: CmsFailure) => {
    if (failure.error === 'SlugConflict') return setErrors({ slug: text.authors.slugTaken })
    if (failure.error === 'TextTooLong' && failure.field !== undefined) return setErrors({ [failure.field]: text.errors.tooLong(failure.max ?? 0) })
    if (failure.error === 'ValidationError') return setErrors({ form: text.errors.generic })
    toast({ title: failure.error === 'ContentConflict' ? text.editor.conflict : failureText(text, failure), tone: 'danger' })
  }

  const save = async () => {
    const sameAs = links.split('\n').map((l) => l.trim()).filter((l) => l !== '')
    const local: FieldErrors = {
      ...(name.trim() === '' ? { name: text.errors.required } : {}),
      ...(slug.trim() !== '' && slug.trim() !== author?.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim()) ? { slug: text.authors.slugInvalid } : {}),
      ...(sameAs.some((l) => !/^https:\/\/[^/\\]/i.test(l)) ? { sameAs: text.authors.linksInvalid } : {}),
    }
    setErrors(local)
    if (Object.keys(local).length > 0) return
    setBusy('save')
    const result = await cmsCall<AuthorSaved>('saveAuthor', {
      ...(author === null ? {} : { authorId: author.id }),
      userId,
      name,
      slug: slug.trim() === '' ? null : slug.trim(),
      avatarAssetId: avatar?.assetId ?? null,
      removeAvatar,
      sameAs,
      translations: Object.fromEntries(LOCALES.map((l) => [l, { bio: translations[l].bio ?? null, jobTitle: translations[l].jobTitle ?? null }])),
      revision: author?.revision ?? 0,
    })
    setBusy(null)
    if (!result.ok) return fail(result)
    toast({ title: result.data.purgeTargets > 0 ? text.authors.savedPurged(result.data.purge?.done ?? 0) : text.authors.saved, tone: 'success' })
    onDone()
  }

  const remove = async () => {
    if (author === null) return
    setBusy('delete')
    const result = await cmsCall<unknown>('deleteAuthor', { authorId: author.id })
    setBusy(null)
    setConfirmDelete(false)
    if (!result.ok) return fail(result)
    toast({ title: text.authors.deleted, tone: 'success' })
    onDone()
  }

  return (
    <div className="grid max-w-180 gap-4">
      <Button variant="ghost" className="-ml-2 justify-self-start" onClick={onCancel}>
        <ArrowLeft aria-hidden className="size-4" />
        {text.authors.back}
      </Button>
      <h1 className="text-xl font-heading tracking-heading text-text [overflow-wrap:anywhere]">{author?.name ?? text.authors.newAuthor}</h1>
      {errors['form'] ? <Notice tone="warn">{errors['form']}</Notice> : null}
      <Field label={text.authors.user}>
        {author === null ? (
          <Select
            value={userId}
            onValueChange={(id) => {
              setUserId(id)
              setName(candidates.find((c) => c.userId === id)?.name ?? name)
            }}
            options={candidates.map((c) => ({ value: c.userId, label: `${c.name} · ${c.email}` }))}
            placeholder={text.authors.pickUser}
          />
        ) : (
          <Input value={author.userEmail} readOnly />
        )}
      </Field>
      <Field label={text.authors.name} error={errors['name']}>
        <Input value={name} maxLength={AUTHOR_LIMITS.name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={text.authors.slug} hint={text.authors.slugHint} error={errors['slug']}>
        <Input value={slug} maxLength={96} autoCapitalize="none" spellCheck={false} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <ImageField
        label={text.authors.avatar}
        image={removeAvatar ? null : avatar}
        chooseLabel={text.authors.chooseAvatar}
        removeLabel={text.authors.removeAvatar}
        emptyLabel={text.authors.noAvatar}
        aspect="aspect-square max-w-32"
        onPick={(asset) => {
          setAvatar({ assetId: asset.id, url: asset.url })
          setRemoveAvatar(false)
        }}
        onRemove={() => {
          setAvatar(null)
          setRemoveAvatar(true)
        }}
      />
      <Field label={text.authors.links} hint={text.authors.linksHint} error={errors['sameAs']}>
        <Textarea value={links} rows={3} autoCapitalize="none" spellCheck={false} onChange={(e) => setLinks(e.target.value)} />
      </Field>

      <fieldset className="grid gap-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-md font-medium">{text.authors.perLocale}</legend>
        <div role="tablist" aria-label={text.authors.perLocale} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {LOCALES.map((l) => {
            const filled = (translations[l].bio ?? '') !== '' || (translations[l].jobTitle ?? '') !== ''
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={l === locale}
                onClick={() => setLocale(l)}
                className={`relative inline-flex h-11 min-w-11 items-center gap-1 px-2.5 text-md font-medium ${l === locale ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand after:content-['']" : 'text-text-2 hover:text-text'}`}
              >
                <span className="uppercase">{l}</span>
                <span aria-hidden className="text-text-3">{filled ? '●' : '–'}</span>
                <span className="sr-only">{LOCALE_NAMES[l]}</span>
              </button>
            )
          })}
        </div>
        <Field label={text.authors.jobTitle} error={errors[`jobTitle.${locale}`]}>
          <Input value={current.jobTitle ?? ''} maxLength={AUTHOR_LIMITS.jobTitle} onChange={(e) => setTranslation('jobTitle', e.target.value)} />
        </Field>
        <Field label={text.authors.bio} error={errors[`bio.${locale}`]} hint={`${(current.bio ?? '').length} / ${AUTHOR_LIMITS.bio}`}>
          <Textarea value={current.bio ?? ''} rows={4} maxLength={AUTHOR_LIMITS.bio} onChange={(e) => setTranslation('bio', e.target.value)} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === 'save'} onClick={() => void save()} {...(userId === '' ? { disabledReason: text.authors.pickUser } : {})}>
          {text.authors.save}
        </Button>
        {author === null ? null : (
          <Button variant="danger-quiet" onClick={() => setConfirmDelete(true)} {...(author.posts > 0 ? { disabledReason: text.authors.hasPosts } : {})}>
            {text.authors.delete}
          </Button>
        )}
      </div>
      {author !== null && author.posts > 0 ? <p className="text-sm text-text-3">{text.authors.hasPosts}</p> : null}

      <Dialog open={confirmDelete} onOpenChange={(o) => (o ? null : setConfirmDelete(false))}>
        <DialogContent
          title={text.authors.delete}
          closeLabel={text.picker.close}
          footer={
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(false)}>{text.list.cancel}</Button>
              <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
                {text.editor.confirm}
              </Button>
            </DialogFooter>
          }
        >
          <p>{text.authors.deleteConfirm}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
