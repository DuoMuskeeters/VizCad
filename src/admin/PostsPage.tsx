import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText, Plus } from 'lucide-react'
import { Badge, type BadgeTone } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '#/components/ui/Dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { LOCALES, type Locale } from '#/i18n/locales'
import { type AdminPostList, type AdminPostRow, type Coverage, POST_LIMITS, type PostStatus } from '#/shared/cmsTypes'
import { AdminLink } from './AdminLink'
import { cmsCall, type CmsFailure } from './api'
import { adminPaths } from './routes'
import { failureText } from './failures'
import { formatDay } from './format'
import { useAdminText } from './text'

const statusTone: Record<PostStatus, BadgeTone> = { draft: 'neutral', published: 'accent', archived: 'warn' }

/** `EN ●` live, `TR ◐` draft (or live with a draft pending), `DE –` none (docs/12 §9). The text carries the meaning too. */
const mark: Record<Coverage, string> = { live: '●', 'live-draft': '●◐', draft: '◐', none: '–' }

export const StatusBadge = ({ status }: { status: PostStatus }) => {
  const { text } = useAdminText()
  return <Badge tone={statusTone[status]}>{text.status[status]}</Badge>
}

const CoverageList = ({ coverage }: { coverage: AdminPostRow['coverage'] }) => {
  const { text } = useAdminText()
  return (
    <ul className="flex flex-wrap gap-x-2.5 gap-y-1 text-sm">
      {LOCALES.map((locale) => (
        <li key={locale} className={coverage[locale] === 'none' ? 'text-text-3' : 'text-text'}>
          <span className="font-medium uppercase">{locale}</span> <span aria-hidden>{mark[coverage[locale]]}</span>
          <span className="sr-only">{`: ${text.coverage[coverage[locale]]}`}</span>
        </li>
      ))}
    </ul>
  )
}

type Filters = { readonly status: PostStatus | 'all'; readonly missing: Locale | 'all'; readonly q: string }

type ListState = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly rows: ReadonlyArray<AdminPostRow>; readonly next: string | null }

/** `/admin/cms/posts`: every post, newest change first, with language coverage; filters and "new post". */
export const PostsPage = () => {
  const { text } = useAdminText()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>({ status: 'all', missing: 'all', q: '' })
  const [query, setQuery] = useState('')
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(
    (cursor?: string) =>
      cmsCall<AdminPostList>('listPostsAdmin', {
        ...(filters.status === 'all' ? {} : { status: filters.status }),
        ...(filters.missing === 'all' ? {} : { missingLocale: filters.missing }),
        ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
        ...(cursor === undefined ? {} : { cursor }),
      }),
    [filters],
  )

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void load().then((result) => {
      if (cancelled) return
      setState(result.ok ? { status: 'ready', rows: result.data.rows, next: result.data.next } : { status: 'error', failure: result })
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Search waits for a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 300)
    return () => clearTimeout(id)
  }, [query])

  const more = async () => {
    if (state.status !== 'ready' || state.next === null) return
    setLoadingMore(true)
    const result = await load(state.next)
    setLoadingMore(false)
    if (result.ok) setState({ status: 'ready', rows: [...state.rows, ...result.data.rows], next: result.data.next })
  }

  const filtered = filters.status !== 'all' || filters.missing !== 'all' || filters.q !== ''

  return (
    <>
      <PageHeader
        title={text.list.title}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            {text.list.newPost}
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Field label={<span className="sr-only">{text.list.search}</span>}>
          <Input type="search" value={query} placeholder={text.list.search} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Select
          aria-label={text.list.status}
          value={filters.status}
          onValueChange={(value) => setFilters((f) => ({ ...f, status: value as Filters['status'] }))}
          options={[{ value: 'all', label: text.list.anyStatus }, ...(['draft', 'published', 'archived'] as const).map((s) => ({ value: s, label: text.status[s] }))]}
          className="sm:w-44"
        />
        <Select
          aria-label={text.list.missing}
          value={filters.missing}
          onValueChange={(value) => setFilters((f) => ({ ...f, missing: value as Filters['missing'] }))}
          options={[{ value: 'all', label: `${text.list.missing}: ${text.list.anyLocale}` }, ...LOCALES.map((l) => ({ value: l, label: `${text.list.missing}: ${l.toUpperCase()}` }))]}
          className="sm:w-56"
        />
      </div>

      {state.status === 'loading' ? (
        <div className="grid gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : state.status === 'error' ? (
        <InlineAlert title={failureText(text, state.failure)} action={<Button onClick={() => setFilters((f) => ({ ...f }))}>{text.gate.retry}</Button>} />
      ) : state.rows.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={filtered ? text.list.noMatch : text.list.empty}
          actions={filtered ? undefined : <Button variant="primary" onClick={() => setCreating(true)}>{text.list.newPost}</Button>}
        />
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {state.rows.map((row) => (
              <li key={row.id}>
                <AdminLink
                  href={adminPaths.post(row.id)}
                  className="grid min-h-11 gap-x-6 gap-y-1.5 px-4 py-3 hover:bg-hover xl:grid-cols-[minmax(0,1fr)_7rem_13rem_9rem_7rem_5rem] xl:items-center"
                >
                  <span className="min-w-0 font-medium text-text [overflow-wrap:anywhere]">{row.title}</span>
                  <span>
                    <StatusBadge status={row.status} />
                  </span>
                  <CoverageList coverage={row.coverage} />
                  <span className="text-sm text-text-2">{row.authorName ?? '–'}</span>
                  <span className="text-sm text-text-2">
                    <span className="xl:sr-only">{`${text.list.colPublished}: `}</span>
                    {row.lastPublishedAt === null ? text.list.never : formatDay(row.lastPublishedAt)}
                  </span>
                  <span className="text-sm tabular-nums text-text-3">
                    <span className="xl:sr-only">{`${text.list.colViews}: `}</span>
                    {row.views}
                  </span>
                </AdminLink>
              </li>
            ))}
          </ul>
          {state.next === null ? null : (
            <div className="mt-4 flex justify-center">
              <Button loading={loadingMore} onClick={() => void more()}>
                {text.list.more}
              </Button>
            </div>
          )}
        </>
      )}

      <CreatePostDialog open={creating} onOpenChange={setCreating} onCreated={(id) => void navigate({ href: adminPaths.post(id) })} />
    </>
  )
}

const CreatePostDialog = ({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void }) => {
  const { text } = useAdminText()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === '') return setError(text.errors.required)
    setBusy(true)
    const result = await cmsCall<{ postId: string }>('createPost', { title })
    setBusy(false)
    if (result.ok) {
      onOpenChange(false)
      setTitle('')
      onCreated(result.data.postId)
    } else setError(failureText(text, result))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={text.list.createTitle}
        footer={
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{text.list.cancel}</Button>
            <Button variant="primary" type="submit" form="create-post" loading={busy}>
              {text.list.create}
            </Button>
          </DialogFooter>
        }
      >
        <form id="create-post" onSubmit={(e) => void submit(e)} className="grid gap-3">
          <Field label={text.list.createLabel} error={error} required>
            <Input value={title} maxLength={POST_LIMITS.title} autoFocus onChange={(e) => {
              setTitle(e.target.value)
              setError(undefined)
            }} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
