import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input, Textarea } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { SwitchRow } from '#/components/ui/Switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { LOCALE_NAMES, LOCALES, type Locale } from '#/i18n/locales'
import { type AdminPost, type DraftSaved, POST_LIMITS, type PublishResult, type RenderWarnings, SEO_HINTS, type TranslationFields } from '#/shared/cmsTypes'
import { paths } from '#/shared/marketingRoutes'
import { useAdminInfo } from './AdminLayout'
import { AdminLink } from './AdminLink'
import { adminPaths } from './routes'
import { cmsCall, type CmsFailure } from './api'
import { failureText } from './failures'
import { StatusBadge } from './PostsPage'
import { type AdminText, useAdminText } from './text'

// Client only (CodeMirror needs the DOM); the admin is client rendered anyway, and this keeps it out of the server build.
const loadEditor = createClientOnlyFn(() => import('./MarkdownEditor.client'))
const MarkdownEditor = lazy(loadEditor)

/** `disabledReason` only when there is one (`exactOptionalPropertyTypes`). */
const why = (reason: string | undefined) => (reason === undefined ? {} : { disabledReason: reason })

const EMPTY: TranslationFields = { slug: '', title: '', excerpt: '', contentMd: '', metaTitle: null, metaDescription: null, keywords: [], coverAlt: null, ogAssetId: null }

const sourceFields = (post: AdminPost, locale: Locale): TranslationFields => {
  const state = post.locales[locale]
  const from = state.draft ?? state.live
  return from === null ? EMPTY : { slug: from.slug, title: from.title, excerpt: from.excerpt, contentMd: from.contentMd, metaTitle: from.metaTitle, metaDescription: from.metaDescription, keywords: from.keywords, coverAlt: from.coverAlt, ogAssetId: from.ogAssetId }
}

const sameFields = (a: TranslationFields, b: TranslationFields) =>
  a.slug === b.slug && a.title === b.title && a.excerpt === b.excerpt && a.contentMd === b.contentMd && (a.metaTitle ?? '') === (b.metaTitle ?? '') &&
  (a.metaDescription ?? '') === (b.metaDescription ?? '') && a.keywords.join(',') === b.keywords.join(',') && (a.coverAlt ?? '') === (b.coverAlt ?? '') && a.ogAssetId === b.ogAssetId

const splitList = (value: string) => value.split(',').map((v) => v.trim()).filter((v) => v !== '')

const bytes = (value: string) => new TextEncoder().encode(value).length

type FieldErrors = Partial<Record<string, string>>

/** Field-level messages from a failed save or publish (docs/03 §2.15: "slug çakışması alan altında"). */
const fieldErrors = (text: AdminText, failure: CmsFailure): FieldErrors => {
  if (failure.error === 'TextTooLong' && failure.field !== undefined)
    return { [failure.field]: failure.field === 'contentMd' ? text.errors.tooLongBytes(Math.round((failure.max ?? 0) / 1024)) : text.errors.tooLong(failure.max ?? 0) }
  if (failure.error === 'SlugConflict') return { slug: text.editor.slugTaken }
  if (failure.error === 'PublishBlocked' && failure.reason === 'invalid-fields')
    return Object.fromEntries((failure.fields ?? []).map((f) => [f, f === 'slug' ? text.editor.slugInvalid : text.errors.required]))
  return {}
}

const Counter = ({ value, hint, max }: { value: string; hint: number; max: number }) => {
  const { text } = useAdminText()
  return <span className={value.length > hint ? 'text-warn-text' : undefined}>{text.editor.counter(value.length, hint, max)}</span>
}

const Warnings = ({ warnings }: { warnings: RenderWarnings }) => {
  const { text } = useAdminText()
  const lines = [
    ...(warnings.rawHtmlTags.length > 0 ? [text.editor.rawHtml(warnings.rawHtmlTags.join(', '))] : []),
    ...(warnings.droppedLinks.length > 0 ? [text.editor.droppedLinks(warnings.droppedLinks.length)] : []),
    ...(warnings.externalImages.length > 0 ? [text.editor.externalImages(warnings.externalImages.length)] : []),
  ]
  if (lines.length === 0) return null
  return (
    <Notice tone="warn">
      <p className="font-medium">{text.editor.warnings}</p>
      <ul className="list-disc pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Notice>
  )
}

type Load = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly post: AdminPost }

/**
 * `/admin/cms/posts/$id?locale=tr` (docs/12 §9 "Yazı editörü"). Top bar: back, title, status, Save, Preview, Publish /
 * Unpublish. Language tabs with state marks. Left: title, excerpt and the Markdown editor. Right: Details (post-level
 * fields, live at once), SEO (counters, search and social previews), Translation (missing or stale translation).
 */
export const PostEditor = ({ postId, locale }: { postId: string; locale: Locale }) => {
  const { text } = useAdminText()
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Back to loading first: the editor remounts only with the fetched post, never with the stale one.
  const reload = useCallback(() => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void cmsCall<AdminPost>('getPostAdmin', { postId }).then((result) => {
      if (cancelled) return
      setLoad(result.ok ? { status: 'ready', post: result.data } : { status: 'error', failure: result })
    })
    return () => {
      cancelled = true
    }
  }, [postId, attempt])

  if (load.status === 'loading')
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  if (load.status === 'error')
    return <InlineAlert title={failureText(text, load.failure)} action={<Button onClick={reload}>{text.gate.retry}</Button>} />
  return <Editor key={`${postId}:${attempt}`} post={load.post} locale={locale} onReload={reload} onLocale={(l) => void navigate({ href: adminPaths.post(postId, l), replace: true })} />
}

const Editor = ({ post: initial, locale, onReload, onLocale }: { post: AdminPost; locale: Locale; onReload: () => void; onLocale: (locale: Locale) => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const { purgeConfigured } = useAdminInfo()
  const navigate = useNavigate()
  const [post, setPost] = useState(initial)
  // Working copies of every locale opened in this session, so switching tabs keeps unsaved text.
  const [forms, setForms] = useState<Partial<Record<Locale, TranslationFields>>>({})
  const [revisions, setRevisions] = useState<Record<Locale, number>>(() => Object.fromEntries(LOCALES.map((l) => [l, initial.locales[l].revision])) as Record<Locale, number>)
  const [baseline, setBaseline] = useState<Partial<Record<Locale, TranslationFields>>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [hints, setHints] = useState<{ slugTaken: boolean; slugInvalid: boolean }>({ slugTaken: false, slugInvalid: false })
  const [busy, setBusy] = useState<'save' | 'publish' | 'unpublish' | 'preview' | null>(null)
  const [conflict, setConflict] = useState(false)
  const [warnings, setWarnings] = useState<RenderWarnings | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState<ReadonlyArray<string> | null>(null)
  const [purging, setPurging] = useState<number | null>(null)
  // Bumped by every drain, so an unchanged `queued` still schedules the next one.
  const [drains, setDrains] = useState(0)

  const base = baseline[locale] ?? sourceFields(post, locale)
  const form = forms[locale] ?? base
  const dirtyLocales = LOCALES.filter((l) => forms[l] !== undefined && !sameFields(forms[l] as TranslationFields, baseline[l] ?? sourceFields(post, l)))
  const dirty = dirtyLocales.length > 0
  const state = post.locales[locale]
  const publishable = post.publishable.includes(locale)

  const set = <K extends keyof TranslationFields>(key: K, value: TranslationFields[K]) => {
    setForms((all) => ({ ...all, [locale]: { ...(all[locale] ?? base), [key]: value } }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // Set once the post is deleted: its unsaved text is gone with it, so leaving asks nothing.
  const leaving = useRef(false)
  // Language tabs stay on this path (`?locale=`) and keep every working copy, so only leaving the post asks.
  useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && !leaving.current && current.pathname !== next.pathname && !window.confirm(text.editor.leave),
    enableBeforeUnload: () => dirty && !leaving.current,
  })

  const fail = (failure: CmsFailure) => {
    if (failure.error === 'ContentConflict') return setConflict(true)
    const byField = fieldErrors(text, failure)
    setErrors(byField)
    if (Object.keys(byField).length === 0 || failure.error === 'PublishBlocked') toast({ title: failureText(text, failure), tone: 'danger' })
  }

  /** Saves this locale's draft when it changed; resolves to the revision to publish with, or null on failure. */
  const save = async (): Promise<number | null> => {
    if (!dirtyLocales.includes(locale)) return revisions[locale]
    const result = await cmsCall<DraftSaved>('saveDraft', { postId: post.id, locale, fields: form, revision: revisions[locale] })
    if (!result.ok) {
      fail(result)
      return null
    }
    setRevisions((r) => ({ ...r, [locale]: result.data.revision }))
    setBaseline((b) => ({ ...b, [locale]: form }))
    setHints({ slugTaken: result.data.slugTaken, slugInvalid: result.data.slugInvalid })
    setPost((p) => ({ ...p, locales: { ...p.locales, [locale]: { ...p.locales[locale], draft: { ...form, updatedAt: result.data.updatedAt }, revision: result.data.revision } } }))
    return result.data.revision
  }

  const onSave = async () => {
    setBusy('save')
    const revision = await save()
    setBusy(null)
    if (revision !== null) toast({ title: text.editor.saved, tone: 'success' })
  }

  const onPreview = async () => {
    setBusy('preview')
    const revision = await save()
    setBusy(null)
    if (revision !== null) window.open(adminPaths.preview(post.id, locale), '_blank', 'noopener')
  }

  // The latest committed state, read by `refresh` after its await (its own closure is from before the request).
  const latest = useRef({ post, forms, baseline, revisions })
  latest.current = { post, forms, baseline, revisions }

  /**
   * Re-reads the post. A locale moves to the server's copy only when its working copy is clean (unchanged, or equal to
   * `saved`, the text this handler just saved or published). A dirty locale keeps its text, baseline and revision, so a
   * later save of it meets `ContentConflict` instead of overwriting the newer server copy.
   */
  const refresh = async (saved?: { locale: Locale; fields: TranslationFields; revision: number }) => {
    const result = await cmsCall<AdminPost>('getPostAdmin', { postId: post.id })
    if (!result.ok) return
    const now = latest.current
    const kept = LOCALES.flatMap((l) => {
      const working = now.forms[l]
      if (working === undefined) return []
      const was = l === saved?.locale ? saved.fields : (now.baseline[l] ?? sourceFields(now.post, l))
      return sameFields(working, was) ? [] : [{ l, working, was, revision: l === saved?.locale ? saved.revision : now.revisions[l] }]
    })
    setPost(result.data)
    setRevisions(Object.fromEntries(LOCALES.map((l) => [l, kept.find((k) => k.l === l)?.revision ?? result.data.locales[l].revision])) as Record<Locale, number>)
    setBaseline(Object.fromEntries(kept.map((k) => [k.l, k.was])))
    setForms(Object.fromEntries(kept.map((k) => [k.l, k.working])))
  }

  const purgeDone = (result: PublishResult, success: (n: number) => string) => {
    const left = result.purge === null ? result.purgeTargets : result.purge.queued
    const failed = result.purge === null ? result.purgeTargets : result.purge.failed
    toast({ title: failed > 0 ? text.editor.publishedQueued(failed) : success(result.purge?.done ?? 0), tone: failed > 0 ? 'neutral' : 'success' })
    if (result.warnings) setWarnings(result.warnings)
    if (left > 0) setPurging(left)
  }

  const onPublish = async () => {
    setBusy('publish')
    const revision = await save()
    if (revision === null) return setBusy(null)
    const result = await cmsCall<PublishResult>('publishTranslation', { postId: post.id, locale, revision })
    setBusy(null)
    if (!result.ok) return fail(result)
    purgeDone(result.data, text.editor.published)
    await refresh({ locale, fields: form, revision })
  }

  const unpublish = async (confirm: boolean) => {
    setBusy('unpublish')
    const result = await cmsCall<PublishResult>('unpublishTranslation', { postId: post.id, locale, confirm })
    setBusy(null)
    setConfirmUnpublish(null)
    if (!result.ok) {
      if (result.error === 'PublishBlocked' && result.reason === 'other-locales-live') return setConfirmUnpublish(result.fields ?? [])
      return fail(result)
    }
    purgeDone(result.data, () => text.editor.unpublished)
    await refresh()
  }

  // The late (+60 s) purge rows: drain until the queue is empty, while this tab is open (the cron finishes otherwise).
  useEffect(() => {
    if (purging === null || purging === 0) return
    const id = setTimeout(() => {
      void cmsCall<{ purge: { queued: number } }>('drainPurges').then((result) => {
        if (!result.ok) return setPurging(null)
        setPurging(result.data.purge.queued)
        setDrains((n) => n + 1)
        if (result.data.purge.queued === 0) toast({ title: text.editor.purged, tone: 'success' })
      })
    }, 20_000)
    return () => clearTimeout(id)
  }, [purging, drains, toast, text])

  const publishReason = !publishable
    ? text.blocked['locale-closed']
    : !purgeConfigured
      ? text.gate.purgeOff
      : post.status === 'archived'
        ? text.blocked['archived']
        : locale !== 'en' && post.locales.en.live === null
          ? text.blocked['en-not-live']
          : !dirty && state.draft === null
            ? text.blocked['no-draft']
            : undefined

  const contentBytes = bytes(form.contentMd)
  const editorLabels = useMemo(() => ({ heading: 'H2', bold: 'Bold', link: 'Link', image: 'Image', code: 'Code', toolbar: text.editor.content }), [text])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild variant="ghost" className="-ml-2">
          <AdminLink href={adminPaths.posts()}>
            <ArrowLeft aria-hidden className="size-4" />
            {text.editor.back}
          </AdminLink>
        </Button>
        <h1 className="min-w-0 flex-1 basis-60 text-xl font-heading tracking-heading text-text [overflow-wrap:anywhere]">{form.title || post.locales.en.draft?.title || post.locales.en.live?.title || '–'}</h1>
        <StatusBadge status={post.status} />
        {dirty ? <span className="text-sm text-warn-text">{text.editor.unsaved}</span> : null}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button onClick={() => void onSave()} loading={busy === 'save'} {...why(dirtyLocales.includes(locale) ? undefined : text.editor.saved)}>
            {text.editor.save}
          </Button>
          <Button onClick={() => void onPreview()} loading={busy === 'preview'} {...why(state.draft === null && state.live === null && !dirty ? text.editor.noText : undefined)}>
            <Eye aria-hidden className="size-4" />
            {text.editor.preview}
          </Button>
          {state.live !== null ? (
            <Button variant="danger-quiet" onClick={() => void unpublish(false)} loading={busy === 'unpublish'} {...why(purgeConfigured ? undefined : text.gate.purgeOff)}>
              {text.editor.unpublish}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => void onPublish()} loading={busy === 'publish'} {...why(publishReason)}>
            {text.editor.publish}
          </Button>
        </div>
      </header>

      {conflict ? <InlineAlert title={text.editor.conflict} action={<Button onClick={onReload}>{text.editor.reload}</Button>} /> : null}
      {purging !== null && purging > 0 ? (
        <p role="status" className="text-sm text-text-2">
          {text.editor.purging(purging)}
        </p>
      ) : null}

      <nav aria-label="Languages" className="border-b border-line">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {LOCALES.map((l) => {
            const s = post.locales[l]
            const mark = s.live !== null ? (s.draft !== null ? '●◐' : '●') : s.draft !== null ? '◐' : '–'
            const label = s.live !== null ? text.editor.readonlyLive : s.draft !== null ? text.editor.draftOnly : text.editor.noText
            return (
              <li key={l}>
                <button
                  type="button"
                  aria-current={l === locale ? 'page' : undefined}
                  onClick={() => onLocale(l)}
                  className={`relative inline-flex h-11 min-w-11 items-center gap-1.5 px-2.5 text-md font-medium ${l === locale ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand after:content-['']" : 'text-text-2 hover:text-text'}`}
                >
                  <span className="uppercase">{l}</span>
                  <span aria-hidden className="text-text-3">{mark}</span>
                  <span className="sr-only">{`${LOCALE_NAMES[l]}: ${label}${dirtyLocales.includes(l) ? `, ${text.editor.unsaved}` : ''}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {!publishable ? <Notice>{text.editor.closedLocale}</Notice> : null}
      {locale !== 'en' && state.live === null && state.draft === null ? <Notice tone="warn">{text.editor.missingTranslation(LOCALE_NAMES[locale])}</Notice> : null}
      {warnings ? <Warnings warnings={warnings} /> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 app:grid-cols-[minmax(0,1fr)_22rem] app:items-start">
        <section className="grid min-w-0 gap-4" aria-label={text.editor.content}>
          <Field label={text.editor.title} error={errors['title']} hint={<Counter value={form.title} hint={POST_LIMITS.title} max={POST_LIMITS.title} />}>
            <Input value={form.title} maxLength={POST_LIMITS.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label={text.editor.excerpt} error={errors['excerpt']} hint={<Counter value={form.excerpt} hint={SEO_HINTS.metaDescription} max={POST_LIMITS.excerpt} />}>
            <Textarea value={form.excerpt} rows={2} maxLength={POST_LIMITS.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
          </Field>
          <div className="grid gap-1.5">
            <span id="content-label" className="text-md font-medium app:text-base">
              {text.editor.content}
            </span>
            <Suspense fallback={<Textarea aria-labelledby="content-label" value={form.contentMd} rows={18} onChange={(e) => set('contentMd', e.target.value)} />}>
              <MarkdownEditor value={form.contentMd} onChange={(v) => set('contentMd', v)} label={text.editor.content} labels={editorLabels} />
            </Suspense>
            <p className={`text-sm ${contentBytes > POST_LIMITS.contentMd ? 'text-danger' : 'text-text-3'}`}>
              {`${Math.ceil(contentBytes / 1024)} / ${POST_LIMITS.contentMd / 1024} KB`}
            </p>
            {errors['contentMd'] ? <p role="alert" className="text-sm text-danger">{errors['contentMd']}</p> : null}
          </div>
        </section>

        <aside className="min-w-0 rounded-lg border border-line p-4">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details" className="min-w-11 justify-center">{text.editor.tabDetails}</TabsTrigger>
              <TabsTrigger value="seo" className="min-w-11 justify-center">{text.editor.tabSeo}</TabsTrigger>
              {locale === 'en' ? null : <TabsTrigger value="translation" className="min-w-11 justify-center">{text.editor.tabTranslation}</TabsTrigger>}
            </TabsList>
            <TabsContent value="details" className="grid gap-4 pt-4">
              <Field
                label={text.editor.slug}
                error={errors['slug'] ?? (hints.slugInvalid ? text.editor.slugInvalid : hints.slugTaken ? text.editor.slugTaken : undefined)}
                hint={text.editor.slugHint}
              >
                <Input value={form.slug} maxLength={96} autoCapitalize="none" spellCheck={false} onChange={(e) => set('slug', e.target.value)} />
              </Field>
              <MetaPanel post={post} onSaved={() => refresh()} onConflict={() => setConflict(true)} />
              <Lifecycle post={post} onChanged={() => refresh()} onDeleted={() => {
                  leaving.current = true
                  void navigate({ href: adminPaths.posts() })
                }} />
            </TabsContent>
            <TabsContent value="seo" className="grid gap-4 pt-4">
              <Field label={text.editor.metaTitle} error={errors['metaTitle']} hint={<Counter value={form.metaTitle ?? ''} hint={SEO_HINTS.metaTitle} max={POST_LIMITS.metaTitle} />}>
                <Input value={form.metaTitle ?? ''} maxLength={POST_LIMITS.metaTitle} placeholder={form.title} onChange={(e) => set('metaTitle', e.target.value)} />
              </Field>
              <Field label={text.editor.metaDescription} error={errors['metaDescription']} hint={<Counter value={form.metaDescription ?? ''} hint={SEO_HINTS.metaDescription} max={POST_LIMITS.metaDescription} />}>
                <Textarea value={form.metaDescription ?? ''} rows={3} maxLength={POST_LIMITS.metaDescription} placeholder={form.excerpt} onChange={(e) => set('metaDescription', e.target.value)} />
              </Field>
              <Field label={text.editor.keywords} hint={text.editor.keywordsHint} error={errors['keywords']}>
                <Input value={form.keywords.join(', ')} onChange={(e) => set('keywords', splitList(e.target.value))} />
              </Field>
              <Field label={text.editor.coverAlt} error={errors['coverAlt']}>
                <Input value={form.coverAlt ?? ''} maxLength={POST_LIMITS.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} />
              </Field>
              <SeoPreview post={post} form={form} locale={locale} />
            </TabsContent>
            {locale === 'en' ? null : (
              <TabsContent value="translation" className="grid gap-4 pt-4">
                <TranslationPanel post={post} locale={locale} />
              </TabsContent>
            )}
          </Tabs>
        </aside>
      </div>

      <Dialog open={confirmUnpublish !== null} onOpenChange={(open) => (open ? null : setConfirmUnpublish(null))}>
        <DialogContent
          title={text.editor.unpublish}
          footer={
            <DialogFooter>
              <Button onClick={() => setConfirmUnpublish(null)}>{text.list.cancel}</Button>
              <Button variant="danger" loading={busy === 'unpublish'} onClick={() => void unpublish(true)}>
                {text.editor.confirm}
              </Button>
            </DialogFooter>
          }
        >
          <p>{text.editor.unpublishConfirm((confirmUnpublish ?? []).map((l) => l.toUpperCase()).join(', '))}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Post-level fields (docs/12 §3.2 `updatePostMeta`): saved on their own and live at once. */
const MetaPanel = ({ post, onSaved, onConflict }: { post: AdminPost; onSaved: () => Promise<void>; onConflict: () => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const [category, setCategory] = useState(post.category)
  const [tags, setTags] = useState(post.tags.join(', '))
  const [authorId, setAuthorId] = useState(post.authorId)
  const [coverAssetId, setCoverAssetId] = useState(post.cover?.assetId ?? null)
  const [removeCover, setRemoveCover] = useState(false)
  const [featured, setFeatured] = useState(post.featured)
  const [toc, setToc] = useState(post.tableOfContents)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const changed =
    category !== post.category || splitList(tags).join(',') !== post.tags.join(',') || authorId !== post.authorId || coverAssetId !== (post.cover?.assetId ?? null) || removeCover || featured !== post.featured || toc !== post.tableOfContents

  const submit = async () => {
    setBusy(true)
    const result = await cmsCall<PublishResult>('updatePostMeta', { postId: post.id, category, tags: splitList(tags), authorId, coverAssetId, removeCover, featured, tableOfContents: toc, revision: post.revision })
    setBusy(false)
    if (!result.ok) {
      if (result.error === 'ContentConflict') return onConflict()
      const byField = fieldErrors(text, result)
      setErrors(byField)
      if (Object.keys(byField).length === 0) toast({ title: failureText(text, result), tone: 'danger' })
      return
    }
    toast({ title: result.data.purgeTargets > 0 ? text.editor.published(result.data.purge?.done ?? 0) : text.editor.saved, tone: 'success' })
    await onSaved()
  }

  const authors = post.authors.some((a) => a.userId === post.authorId) ? post.authors : [...post.authors, { userId: post.authorId, name: post.authorId }]

  return (
    <div className="grid gap-4 border-t border-line pt-4">
      <Field label={text.editor.category} error={errors['category']}>
        <Input value={category} maxLength={POST_LIMITS.category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
      <Field label={text.editor.tags} hint={text.editor.tagsHint} error={errors['tags']}>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Field label={text.editor.author}>
        <Select value={authorId} onValueChange={setAuthorId} options={authors.map((a) => ({ value: a.userId, label: a.name }))} />
      </Field>
      <div className="grid gap-1.5">
        <span className="text-md font-medium app:text-base">{text.editor.cover}</span>
        {post.cover !== null && !removeCover ? (
          <div className="grid gap-2">
            <img src={post.cover.url} alt="" className="aspect-[1200/630] w-full rounded-md border border-line object-cover" loading="lazy" />
            <Button
              variant="ghost"
              onClick={() => {
                setRemoveCover(true)
                setCoverAssetId(null)
              }}
            >
              {text.editor.removeCover}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-3">{text.editor.noCover}</p>
        )}
      </div>
      <SwitchRow label={text.editor.featured} checked={featured} onCheckedChange={setFeatured} />
      <SwitchRow label={text.editor.toc} checked={toc} onCheckedChange={setToc} />
      <Button onClick={() => void submit()} loading={busy} {...why(changed ? undefined : text.editor.saved)}>
        {text.editor.saveDetails}
      </Button>
    </div>
  )
}

/** Archive / restore / delete, with a confirmation each. */
const Lifecycle = ({ post, onChanged, onDeleted }: { post: AdminPost; onChanged: () => Promise<void>; onDeleted: () => void }) => {
  const { text } = useAdminText()
  const { toast } = useToast()
  const [ask, setAsk] = useState<'archive' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const neverPublished = LOCALES.every((l) => post.locales[l].live === null) && post.status !== 'published'

  const act = async (operation: 'archivePost' | 'restorePost' | 'deletePost') => {
    setBusy(true)
    const result = await cmsCall<unknown>(operation, { postId: post.id })
    setBusy(false)
    setAsk(null)
    if (!result.ok) return toast({ title: failureText(text, result), tone: 'danger' })
    if (operation === 'deletePost') {
      toast({ title: text.editor.deleted, tone: 'success' })
      return onDeleted()
    }
    toast({ title: operation === 'archivePost' ? text.editor.archived : text.editor.restored, tone: 'success' })
    await onChanged()
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
      {post.status === 'archived' ? (
        <Button onClick={() => void act('restorePost')} loading={busy}>
          {text.editor.restore}
        </Button>
      ) : (
        <Button variant="danger-quiet" onClick={() => setAsk('archive')}>
          {text.editor.archive}
        </Button>
      )}
      <Button variant="danger-quiet" onClick={() => setAsk('delete')} {...why(neverPublished ? undefined : text.blocked['published-before'])}>
        {text.editor.delete}
      </Button>
      <Dialog open={ask !== null} onOpenChange={(open) => (open ? null : setAsk(null))}>
        <DialogContent
          title={ask === 'delete' ? text.editor.delete : text.editor.archive}
          footer={
            <DialogFooter>
              <Button onClick={() => setAsk(null)}>{text.list.cancel}</Button>
              <Button variant="danger" loading={busy} onClick={() => void act(ask === 'delete' ? 'deletePost' : 'archivePost')}>
                {text.editor.confirm}
              </Button>
            </DialogFooter>
          }
        >
          <p>{ask === 'delete' ? text.editor.deleteConfirm : text.editor.archiveConfirm}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const PreviewBox = ({ title, children }: { title: string; children: ReactNode }) => (
  <figure className="grid gap-1.5">
    <figcaption className="text-sm font-medium text-text-2">{title}</figcaption>
    <div className="rounded-md border border-line p-3">{children}</div>
  </figure>
)

/** Google result and social card as they would read (truncated like the hints suggest). */
const SeoPreview = ({ post, form, locale }: { post: AdminPost; form: TranslationFields; locale: Locale }) => {
  const { text } = useAdminText()
  const host = typeof window === 'undefined' ? '' : window.location.host
  const title = form.metaTitle || form.title
  const description = form.metaDescription || form.excerpt
  const cut = (value: string, n: number) => (value.length > n ? `${value.slice(0, n - 1)}…` : value)
  return (
    <>
      <PreviewBox title={text.editor.serpPreview}>
        <p className="truncate text-sm text-text-3">{`${host}${paths.post(locale, form.slug || 'slug')}`}</p>
        <p className="text-lg text-accent [overflow-wrap:anywhere]">{cut(`${title} · VizCad Blog`, SEO_HINTS.metaTitle + 13)}</p>
        <p className="text-sm text-text-2 [overflow-wrap:anywhere]">{cut(description, SEO_HINTS.metaDescription)}</p>
      </PreviewBox>
      <PreviewBox title={text.editor.socialPreview}>
        {post.cover === null ? null : <img src={post.cover.url} alt="" className="mb-2 aspect-[1200/630] w-full rounded-sm object-cover" loading="lazy" />}
        <p className="text-xs uppercase text-text-3">{host}</p>
        <p className="font-medium text-text [overflow-wrap:anywhere]">{title}</p>
        <p className="text-sm text-text-2 [overflow-wrap:anywhere]">{cut(description, 120)}</p>
      </PreviewBox>
    </>
  )
}

/** The Translation tab: what is missing or stale against English, and the English text side by side on demand. */
const TranslationPanel = ({ post, locale }: { post: AdminPost; locale: Locale }) => {
  const { text } = useAdminText()
  const [open, setOpen] = useState(false)
  const english = post.locales.en.draft ?? post.locales.en.live
  const own = post.locales[locale].live
  const enLive = post.locales.en.live
  const staleDays = own !== null && enLive !== null ? Math.floor((enLive.updatedAt - own.updatedAt) / 86_400) : 0
  return (
    <>
      {own === null && post.locales[locale].draft === null ? <Notice tone="warn">{text.editor.missingTranslation(LOCALE_NAMES[locale])}</Notice> : null}
      {staleDays >= 1 ? <Notice tone="warn">{text.editor.englishNewer(staleDays)}</Notice> : null}
      {english === null ? null : (
        <>
          <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? text.editor.hideEnglish : text.editor.showEnglish}
          </Button>
          {open ? (
            <div lang="en" className="grid max-h-[32rem] gap-2 overflow-y-auto rounded-md border border-line bg-surface p-3 text-sm">
              <p className="font-medium text-text">{english.title}</p>
              <p className="text-text-2">{english.excerpt}</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-text-2">{english.contentMd}</pre>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
