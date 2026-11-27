import { useCallback, useEffect, useRef, useState } from 'react'
import { CornerDownRight, Download, History, MapPin, MapPinOff, Trash2, Upload, X } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { SwitchRow } from '#/components/ui/Switch'
import { Field } from '#/components/ui/Field'
import { Textarea } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import type { CommentPage, CommentView, FileActivityPage, PendingPin, VersionEntry } from '#/shared/fileViews'
import { useI18n, type I18nKey } from '#/i18n'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { formatBytes, formatDateTime, formatWhen } from './format'
import { contentUrl, type FileAbilities } from './types'
import { useUploads } from './UploadProvider'

const COMMENT_MAX = 4000

type Load<T> = { readonly status: 'loading' } | { readonly status: 'error'; readonly error: string } | { readonly status: 'ready'; readonly data: T }

/** One call per tab; the error stays inside the tab (docs/03 §2.5: the panel never closes). */
const useTabData = <T,>(operation: string, workspaceId: string, fileId: string, enabled = true, reloadKey = 0) => {
  const { call, expire } = useSession()
  const [state, setState] = useState<Load<T>>({ status: 'loading' })
  const load = useCallback(async () => {
    const result = await call<T>(operation, { workspaceId, fileId })
    if (result.ok) setState({ status: 'ready', data: result.data })
    else if (result.error === 'Unauthenticated') expire()
    else setState({ status: 'error', error: result.error })
  }, [call, expire, operation, workspaceId, fileId])
  useEffect(() => {
    if (!enabled) return
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    void load()
  }, [load, enabled, reloadKey])
  return { state, reload: load, set: setState }
}

const TabSkeleton = () => (
  <div role="status" aria-busy="true" className="grid gap-3 pt-2">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-2/3" />
  </div>
)

const TabError = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useI18n()
  return (
    <InlineAlert title={t('file.tab.error')} action={<Button onClick={onRetry}>{t('common.retry')}</Button>}>
      {t('files.error.lead')}
    </InlineAlert>
  )
}

/** ---- Comments ---------------------------------------------------------------------------------------------- */

const COMMENT_PAGE = 100
const COMMENT_PAGES = 20

/** The file's comments, held by the page: the Comments tab lists them and the canvas draws their pins (docs/11 §4.3). */
export const useComments = (workspaceId: string, fileId: string) => {
  const { call } = useSession()
  const { toast } = useToast()
  const { t } = useI18n()
  const [items, setItems] = useState<readonly CommentView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // From the start: every page (up to COMMENT_PAGES of them), so the canvas draws every pin and numbers them in comment
  // order; past that, "Load more" goes on from where it stopped. A page that fails later keeps what came.
  const live = useRef(0)
  const load = useCallback(
    async (after: string | null) => {
      const run = after === null ? ++live.current : live.current
      let next = after
      const got: CommentView[] = []
      for (let page = 0; page < (after === null ? COMMENT_PAGES : 1); page++) {
        const result = await call<CommentPage>('listComments', { workspaceId, fileId, limit: COMMENT_PAGE, ...(next === null ? {} : { cursor: next }) })
        // Another file (or a fresh start) meanwhile: this run's pages are not this list's.
        if (run !== live.current) return
        if (!result.ok) {
          if (page > 0) break
          return after === null ? setFailed(true) : undefined
        }
        got.push(...result.data.items)
        next = result.data.nextCursor
        if (next === null) break
      }
      setFailed(false)
      setItems((current) => (after === null || current === null ? got : [...current, ...got]))
      setCursor(next)
    },
    [call, workspaceId, fileId],
  )
  useEffect(() => {
    setItems(null)
    void load(null)
  }, [load])

  const add = useCallback(
    async (input: { content: string; parentId?: string; anchor?: PendingPin }) => {
      const result = await call<CommentView>('addComment', {
        workspaceId, fileId, content: input.content,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        ...(input.anchor === undefined ? {} : { anchor: { v: 1, path: input.anchor.path, point: input.anchor.point, version: input.anchor.version } }),
      })
      if (result.ok) setItems((current) => [...(current ?? []), result.data])
      return result
    },
    [call, workspaceId, fileId],
  )

  const remove = useCallback(
    async (comment: CommentView) => {
      const result = await call('deleteComment', { workspaceId, commentId: comment.id })
      if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
      setItems((current) => (current ?? []).map((item) => (item.id === comment.id ? { ...item, content: '', deleted: true, canDelete: false, anchor: null } : item)))
      toast({ title: t('comments.deleteDone') })
    },
    [call, workspaceId, toast, t],
  )

  return { items, cursor, failed, load, add, remove }
}

export type Comments = ReturnType<typeof useComments>

/**
 * What the Comments tab knows about pins (only while a 3D model is open). B3: a pin left on another version stays in the
 * list and is not drawn; a pin on a part that is hidden right now is drawn faded and offers "Show".
 */
export type CommentPins = {
  readonly version: number
  /** The pin's number on the canvas, or null when it is not drawn here. */
  readonly numberOf: (comment: CommentView) => number | null
  /** "Pump group › Motor › Terminal box", or null when the part is not in this model. */
  readonly where: (path: string) => string | null
  readonly hidden: (path: string) => boolean
  readonly onShow: (path: string) => void
  readonly active: string | null
  readonly onActivate: (comment: CommentView) => void
  /** The pin of the comment being written, with the version it was placed on. */
  readonly pending: PendingPin | null
  readonly pendingNumber: number
  readonly placing: boolean
  readonly onPlace: () => void
  readonly onClear: () => void
  readonly show: boolean
  readonly onShowChange: (show: boolean) => void
}

const PinTag = ({ comment, pins }: { comment: CommentView; pins: CommentPins }) => {
  const { t } = useI18n()
  const anchor = comment.anchor
  if (anchor === null) return null
  const where = pins.where(anchor.path)
  const number = pins.numberOf(comment)
  if (comment.versionNumber !== pins.version || where === null || number === null)
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm text-text-3">
        <MapPinOff aria-hidden className="size-4 shrink-0" />
        {comment.versionNumber !== null && comment.versionNumber !== pins.version ? t('comments.pin.old', { number: comment.versionNumber }) : t('comments.pin.missing')}
      </p>
    )
  const hidden = pins.hidden(anchor.path)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2">
      <button
        type="button"
        onClick={() => pins.onActivate(comment)}
        aria-pressed={pins.active === comment.id}
        className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md text-left hover:text-text app:min-h-8 aria-pressed:text-accent"
      >
        <span aria-hidden className={`grid size-5.5 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-canvas ${hidden ? 'opacity-45' : ''}`}>{number}</span>
        <span className="sr-only">{t('comments.pin.label', { number })}</span>
        <span className="min-w-0 break-words">{where}</span>
      </button>
      {hidden ? (
        <>
          <span className="text-text-3">· {t('comments.pin.hidden')}</span>
          <Button variant="ghost" onClick={() => pins.onShow(anchor.path)} className="h-9 px-2 text-sm">
            {t('studio.show')}
          </Button>
        </>
      ) : null}
    </p>
  )
}

const CommentItem = ({ comment, onReply, onDelete, reply = false, pins, active = false }: {
  comment: CommentView
  onReply?: () => void
  onDelete: () => void
  reply?: boolean
  pins?: CommentPins | undefined
  active?: boolean
}) => {
  const { t, locale } = useI18n()
  const name = comment.author?.displayName ?? t('comments.unknownAuthor')
  if (comment.deleted)
    return <div className={`py-2 text-base italic text-text-3 ${reply ? 'ml-9' : ''}`}>{t('comments.deleted')}</div>
  return (
    <div data-comment={comment.id} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-3 ${reply ? 'ml-9' : ''} ${active ? '-mx-2 rounded-lg bg-accent-soft px-2' : ''}`}>
      <Avatar name={name} size="sm" decorative />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-base">
          <span className="font-medium">{comment.mine ? t('comments.you', { name }) : name}</span>
          <span className="text-sm text-text-3">{formatWhen(comment.createdAt, locale)}</span>
          {comment.versionNumber !== null ? <span className="text-sm text-text-3">{t('comments.version', { number: comment.versionNumber })}</span> : null}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-md text-text">{comment.content}</p>
        {pins ? <PinTag comment={comment} pins={pins} /> : null}
        <div className="mt-1 flex gap-1">
          {onReply ? (
            <Button variant="ghost" onClick={onReply} className="h-9 px-2 text-base">
              <CornerDownRight aria-hidden className="size-4" />
              {t('comments.reply')}
            </Button>
          ) : null}
          {comment.canDelete ? (
            <Button variant="ghost" onClick={onDelete} className="h-9 px-2 text-base text-danger">
              <Trash2 aria-hidden className="size-4" />
              {t('comments.delete')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const CommentsTab = ({ comments, can, pins }: { comments: Comments; can: FileAbilities; pins?: CommentPins | undefined }) => {
  const { t } = useI18n()
  const { items, cursor, failed, load, add, remove } = comments
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<CommentView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const pending = pins?.pending ?? null

  // A pin was just placed: the comment for it is written next. Not at once: on a phone the tap's click still follows
  // the pointer, and a page that scrolled meanwhile would hand that click to whatever is now under the finger.
  useEffect(() => {
    if (pending === null) return
    setReplyTo(null)
    const timer = setTimeout(() => {
      field.current?.focus({ preventScroll: true })
      field.current?.scrollIntoView({ block: 'nearest' })
    }, 400)
    return () => clearTimeout(timer)
  }, [pending])
  // A pin pressed on the canvas: its comment comes into view.
  const activeId = pins?.active ?? null
  useEffect(() => {
    if (activeId === null) return
    document.querySelector(`[data-comment="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const submit = async () => {
    const content = text.trim()
    if (content === '') return
    if (content.length > COMMENT_MAX) return setError(t('comments.tooLong'))
    setBusy(true)
    setError(null)
    const anchor = replyTo === null && pending !== null ? pending : undefined
    const result = await add({ content, ...(replyTo === null ? {} : { parentId: replyTo.id }), ...(anchor === undefined ? {} : { anchor }) })
    setBusy(false)
    // The pin stays (and the text): a new version came while it was written, so it is placed again on that one.
    if (!result.ok) return setError(anchor !== undefined && result.error === 'VersionChanged' ? t('comments.pin.versionChanged', { number: anchor.version }) : t(failureKey(result)))
    setText('')
    setReplyTo(null)
    if (anchor !== undefined) pins?.onClear()
  }

  if (failed) return <TabError onRetry={() => void load(null)} />
  if (items === null) return <TabSkeleton />
  const top = items.filter((item) => item.parentId === null)
  const repliesOf = (id: string) => items.filter((item) => item.parentId === id)
  const anyPin = top.some((item) => item.anchor !== null && !item.deleted)
  return (
    <div className="grid grid-cols-1 gap-4">
      {pins && anyPin ? (
        <SwitchRow label={t('comments.pin.showAll')} checked={pins.show} onCheckedChange={pins.onShowChange} className="min-h-11" />
      ) : null}
      {top.length === 0 ? (
        <p className="py-4 text-md text-text-2">{pins && can.comment ? t('comments.emptyPin') : t('comments.empty')}</p>
      ) : (
        <ul aria-label={t('comments.list')} className="divide-y divide-line">
          {top.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                comment={comment}
                pins={pins}
                active={pins?.active === comment.id}
                onDelete={() => void remove(comment)}
                {...(can.comment && !comment.deleted ? { onReply: () => setReplyTo(comment) } : {})}
              />
              {repliesOf(comment.id).map((reply) => (
                <CommentItem key={reply.id} comment={reply} reply onDelete={() => void remove(reply)} />
              ))}
            </li>
          ))}
        </ul>
      )}
      {cursor !== null ? (
        <Button onClick={() => void load(cursor)} className="justify-self-start">
          {t('comments.more')}
        </Button>
      ) : null}
      {can.comment ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {replyTo ? (
            <p className="flex items-center gap-2 text-sm text-text-2">
              {t('comments.replyingTo', { name: replyTo.author?.displayName ?? t('comments.unknownAuthor') })}
              <Button variant="ghost" onClick={() => setReplyTo(null)} className="h-8 px-2 text-sm">
                {t('comments.cancelReply')}
              </Button>
            </p>
          ) : null}
          {pins && pending !== null && replyTo === null ? (
            <p className="flex items-center gap-2 rounded-md border border-accent bg-accent-soft py-1 pl-2 text-sm">
              <span aria-hidden className="grid size-5.5 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-canvas">{pins.pendingNumber}</span>
              <span className="min-w-0 flex-1 break-words">{pins.where(pending.path) ?? ''}</span>
              <IconButton label={t('comments.pin.remove')} onClick={pins.onClear}>
                <X aria-hidden className="size-4" />
              </IconButton>
            </p>
          ) : null}
          <Field label={t('comments.label')} {...(error ? { error } : {})}>
            <Textarea ref={field} value={text} onChange={(event) => setText(event.target.value)} placeholder={pending !== null ? t('comments.pin.placeholder') : t('comments.placeholder')} />
          </Field>
          <div className="flex items-center justify-end gap-2">
            {pins && replyTo === null ? (
              <Button variant="ghost" aria-pressed={pins.placing} onClick={pins.onPlace} className="aria-pressed:bg-accent-soft aria-pressed:text-accent">
                <MapPin aria-hidden className="size-4.5" />
                {pending === null ? t('comments.pin.add') : t('comments.pin.move')}
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={busy}>
              {t('comments.send')}
            </Button>
          </div>
        </form>
      ) : (
        <Notice>{t('comments.denied')}</Notice>
      )}
    </div>
  )
}

/** ---- Activity ---------------------------------------------------------------------------------------------- */

const ACTIONS = new Set([
  'file.uploaded', 'file.version_uploaded', 'file.version_restored', 'file.renamed', 'file.moved', 'file.trashed', 'file.restored', 'file.purged',
  'file.previewed', 'file.downloaded', 'file.access_granted', 'file.access_revoked', 'comment.created', 'comment.deleted', 'link.created',
  'link.updated', 'link.revoked', 'link.copied', 'link.opened', 'link.password_failed', 'scene.updated',
])

export const ActivityTab = ({ workspaceId, fileId, can }: { workspaceId: string; fileId: string; can: FileAbilities }) => {
  const { t, locale } = useI18n()
  const { state, reload } = useTabData<FileActivityPage>('listFileActivity', workspaceId, fileId, can.edit)
  if (!can.edit) return <Notice>{t('file.tab.reasonActivity')}</Notice>
  if (state.status === 'loading') return <TabSkeleton />
  if (state.status === 'error') return <TabError onRetry={() => void reload()} />
  if (state.data.items.length === 0) return <p className="py-4 text-md text-text-2">{t('activity.empty')}</p>
  return (
    <ul aria-label={t('activity.list')} className="divide-y divide-line">
      {state.data.items.map((item) => {
        const actor = item.actor.kind === 'link' ? t('activity.link') : item.actor.kind === 'system' ? t('activity.system') : (item.actor.displayName ?? t('activity.someone'))
        const key = (ACTIONS.has(item.action) ? `activity.${item.action}` : 'activity.other') as I18nKey
        return (
          <li key={item.id} className="flex items-baseline gap-3 py-2.5">
            <span className="min-w-0 flex-1 text-md">{t(key, { actor })}</span>
            <time dateTime={new Date(item.createdAt * 1000).toISOString()} className="shrink-0 text-sm text-text-3">
              {formatWhen(item.createdAt, locale)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}

/** ---- Versions ---------------------------------------------------------------------------------------------- */

type VersionList = { current: VersionEntry; versions: readonly VersionEntry[] }

export const VersionsTab = ({
  workspaceId,
  fileId,
  can,
  reloadKey,
  onRestored,
}: {
  workspaceId: string
  fileId: string
  can: FileAbilities
  reloadKey: number
  onRestored: () => void
}) => {
  const { t, locale } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const uploads = useUploads()
  const { state, reload } = useTabData<VersionList>('listVersions', workspaceId, fileId, can.viewHistory, reloadKey)
  const [restoring, setRestoring] = useState<string | null>(null)

  if (!can.viewHistory) return <Notice>{t('file.tab.reasonHistory')}</Notice>
  if (state.status === 'loading') return <TabSkeleton />
  if (state.status === 'error') return <TabError onRetry={() => void reload()} />

  const restore = async (version: VersionEntry) => {
    setRestoring(version.id)
    const result = await call('restoreVersion', { workspaceId, fileId, versionId: version.id })
    setRestoring(null)
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    toast({ title: t('versions.restored', { number: version.number }), tone: 'success' })
    onRestored()
  }

  const all = [state.data.current, ...state.data.versions]
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <Button
          onClick={() => uploads.pick(fileId)}
          {...(can.edit && uploads.allowed ? {} : { disabledReason: t('versions.uploadDenied') })}
        >
          <Upload aria-hidden className="size-4.5" />
          {t('versions.uploadNew')}
        </Button>
      </div>
      {state.data.versions.length === 0 ? <p className="text-md text-text-2">{t('versions.empty')}</p> : null}
      <ul aria-label={t('versions.list')} className="divide-y divide-line">
        {all.map((version) => {
          const isCurrent = version.id === 'current'
          return (
            <li key={version.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <History aria-hidden className="size-4.5 shrink-0 text-text-3" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-md font-medium">
                  {t('versions.number', { number: version.number })}
                  {isCurrent ? <Badge tone="accent">{t('versions.current')}</Badge> : null}
                </p>
                <p className="truncate text-sm text-text-3">
                  {[version.uploadedBy?.displayName, formatDateTime(version.createdAt, locale), formatBytes(version.size, locale)].filter(Boolean).join(' · ')}
                </p>
              </div>
              {can.download ? (
                <a
                  href={contentUrl(fileId, version.id)}
                  aria-label={t('versions.download', { number: version.number })}
                  className="grid size-11 place-items-center rounded-md text-text-2 hover:bg-hover app:size-9"
                >
                  <Download aria-hidden className="size-4.5" />
                </a>
              ) : null}
              {!isCurrent ? (
                <Button
                  loading={restoring === version.id}
                  onClick={() => void restore(version)}
                  aria-label={t('versions.restoreLabel', { number: version.number })}
                  {...(can.edit ? {} : { disabledReason: t('files.reason.edit') })}
                >
                  {t('versions.restore')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {state.data.versions.length > 0 ? <p className="text-sm text-text-3">{t('versions.restoreNote')}</p> : null}
    </div>
  )
}
