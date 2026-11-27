import { useCallback, useEffect, useState } from 'react'
import { CornerDownRight, Download, History, Trash2, Upload } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { Field } from '#/components/ui/Field'
import { Textarea } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import type { CommentPage, CommentView, FileActivityPage, VersionEntry } from '#/shared/fileViews'
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

const CommentItem = ({ comment, onReply, onDelete, reply = false }: { comment: CommentView; onReply?: () => void; onDelete: () => void; reply?: boolean }) => {
  const { t, locale } = useI18n()
  const name = comment.author?.displayName ?? t('comments.unknownAuthor')
  if (comment.deleted)
    return <div className={`py-2 text-base italic text-text-3 ${reply ? 'ml-9' : ''}`}>{t('comments.deleted')}</div>
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-3 ${reply ? 'ml-9' : ''}`}>
      <Avatar name={name} size="sm" decorative />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-base">
          <span className="font-medium">{comment.mine ? t('comments.you', { name }) : name}</span>
          <span className="text-sm text-text-3">{formatWhen(comment.createdAt, locale)}</span>
          {comment.versionNumber !== null ? <span className="text-sm text-text-3">{t('comments.version', { number: comment.versionNumber })}</span> : null}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-md text-text">{comment.content}</p>
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

export const CommentsTab = ({ workspaceId, fileId, can }: { workspaceId: string; fileId: string; can: FileAbilities }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const [items, setItems] = useState<readonly CommentView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<CommentView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (after: string | null) => {
      const result = await call<CommentPage>('listComments', { workspaceId, fileId, ...(after === null ? {} : { cursor: after }) })
      if (!result.ok) return after === null ? setFailed(true) : undefined
      setFailed(false)
      setItems((current) => (after === null || current === null ? result.data.items : [...current, ...result.data.items]))
      setCursor(result.data.nextCursor)
    },
    [call, workspaceId, fileId],
  )
  useEffect(() => {
    setItems(null)
    void load(null)
  }, [load])

  const submit = async () => {
    const content = text.trim()
    if (content === '') return
    if (content.length > COMMENT_MAX) return setError(t('comments.tooLong'))
    setBusy(true)
    setError(null)
    const result = await call<CommentView>('addComment', { workspaceId, fileId, content, ...(replyTo === null ? {} : { parentId: replyTo.id }) })
    setBusy(false)
    if (!result.ok) return setError(t(failureKey(result)))
    setItems((current) => [...(current ?? []), result.data])
    setText('')
    setReplyTo(null)
  }

  const remove = async (comment: CommentView) => {
    const result = await call('deleteComment', { workspaceId, commentId: comment.id })
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    setItems((current) => (current ?? []).map((item) => (item.id === comment.id ? { ...item, content: '', deleted: true, canDelete: false } : item)))
    toast({ title: t('comments.deleteDone') })
  }

  if (failed) return <TabError onRetry={() => void load(null)} />
  if (items === null) return <TabSkeleton />
  const top = items.filter((item) => item.parentId === null)
  const repliesOf = (id: string) => items.filter((item) => item.parentId === id)
  return (
    <div className="grid grid-cols-1 gap-4">
      {top.length === 0 ? (
        <p className="py-4 text-md text-text-2">{t('comments.empty')}</p>
      ) : (
        <ul aria-label={t('comments.list')} className="divide-y divide-line">
          {top.map((comment) => (
            <li key={comment.id}>
              <CommentItem comment={comment} onDelete={() => void remove(comment)} {...(can.comment && !comment.deleted ? { onReply: () => setReplyTo(comment) } : {})} />
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
          <Field label={t('comments.label')} {...(error ? { error } : {})}>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={t('comments.placeholder')} />
          </Field>
          <Button type="submit" variant="primary" loading={busy} className="justify-self-end">
            {t('comments.send')}
          </Button>
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
