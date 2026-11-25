import { useCallback, useEffect, useState } from 'react'
import { EllipsisVertical, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { DataList, DataListBody, DataListCell, DataListHead, DataListHeader, DataListPrimary, DataListRow, FileTile } from '#/components/ui/DataList'
import { EmptyState } from '#/components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '#/components/ui/Menu'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { TrashItem } from '#/shared/fileViews'
import type { AppFailure } from '../api'
import { ConfirmDialog } from '../team/ConfirmDialog'
import { failureKey } from '../errors'
import { formatBytes, formatWhen, tileText } from '../files/format'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: AppFailure }
  | { readonly status: 'ready'; readonly items: readonly TrashItem[]; readonly nextCursor: string | null; readonly loadingMore: boolean }

const columns = 'app:grid-cols-[minmax(0,1fr)_140px_120px_140px_170px]'
const DAY = 86_400

/** Days until the daily job removes the file for good, in words ("in 12 days", "tomorrow", "today"). */
const remaining = (purgeAt: number, t: ReturnType<typeof useI18n>['t'], now = Math.floor(Date.now() / 1000)) => {
  const days = Math.ceil((purgeAt - now) / DAY)
  return days <= 0 ? t('trash.today') : days === 1 ? t('trash.dayLeft') : t('trash.daysLeft', { count: days })
}

export const TrashPage = () => {
  const { t, locale } = useI18n()
  const { call, expire } = useSession()
  const { toast } = useToast()
  const { active } = useWorkspace()
  const workspaceId = active.id
  const manager = active.role === 'owner' || active.role === 'admin'
  const [state, setState] = useState<State>({ status: 'loading' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purging, setPurging] = useState<TrashItem | null>(null)
  const [emptying, setEmptying] = useState(false)
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const result = await call<{ items: TrashItem[]; nextCursor: string | null }>('listTrash', { workspaceId, limit: 30 })
    if (result.ok) setState({ status: 'ready', items: result.data.items, nextCursor: result.data.nextCursor, loadingMore: false })
    else if (result.error === 'Unauthenticated') expire()
    else setState({ status: 'error', failure: result })
  }, [call, expire, workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (state.status !== 'ready' || state.nextCursor === null || state.loadingMore) return
    const cursor = state.nextCursor
    setState({ ...state, loadingMore: true })
    const result = await call<{ items: TrashItem[]; nextCursor: string | null }>('listTrash', { workspaceId, limit: 30, cursor })
    setState((current) => {
      if (current.status !== 'ready') return current
      if (!result.ok) return { ...current, loadingMore: false }
      const known = new Set(current.items.map((i) => i.id))
      return { status: 'ready', items: [...current.items, ...result.data.items.filter((i) => !known.has(i.id))], nextCursor: result.data.nextCursor, loadingMore: false }
    })
  }

  const drop = (id: string) => setState((current) => (current.status === 'ready' ? { ...current, items: current.items.filter((i) => i.id !== id) } : current))

  const restore = async (item: TrashItem) => {
    setBusyId(item.id)
    const result = await call<{ fileId: string; name: string }>('restoreFile', { workspaceId, fileId: item.id })
    setBusyId(null)
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    drop(item.id)
    toast(result.data.name === item.name ? { title: t('trash.restoreDone', { name: item.name }), tone: 'success' } : { title: t('trash.restoreRenamed', { name: result.data.name }) })
  }

  const purge = async () => {
    if (!purging) return
    setWorking(true)
    setError(null)
    const result = await call('purgeFile', { workspaceId, fileId: purging.id })
    setWorking(false)
    if (!result.ok) return setError(t(failureKey(result)))
    drop(purging.id)
    toast({ title: t('trash.purgeDone', { name: purging.name }), tone: 'success' })
    setPurging(null)
  }

  // The server purges in groups; `more` says there is another round (docs/09 §5.3).
  const empty = async () => {
    setWorking(true)
    setError(null)
    setProgress(0)
    let total = 0
    for (;;) {
      const result = await call<{ purged: number; more: boolean }>('emptyTrash', { workspaceId })
      if (!result.ok) {
        setWorking(false)
        if (total > 0) void load()
        return setError(t(failureKey(result)))
      }
      total += result.data.purged
      setProgress(total)
      if (!result.data.more) break
    }
    setWorking(false)
    setEmptying(false)
    void load()
    toast(total === 0 ? { title: t('trash.emptyNothing'), tone: 'danger' } : { title: t('trash.emptyDone'), description: t('trash.emptyDoneCount', { count: total }), tone: 'success' })
  }

  const items = state.status === 'ready' ? state.items : []
  return (
    <>
      <PageHeader
        title={t('trash.title')}
        subtitle={t('trash.lead')}
        actions={
          state.status === 'ready' && items.length > 0 ? (
            <Button variant="danger-quiet" onClick={() => { setError(null); setEmptying(true) }} {...(manager ? {} : { disabledReason: t('trash.emptyReason') })}>
              <Trash2 aria-hidden className="size-4.5" />
              {t('trash.emptyTrash')}
            </Button>
          ) : null
        }
      />
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true" className="grid gap-px pt-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-2 py-3.5">
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          ))}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="py-8">
          <InlineAlert title={t('trash.error.title')} action={<Button onClick={() => void load()}><RefreshCw aria-hidden className="size-4" />{t('common.retry')}</Button>}>
            {t('trash.error.lead')}
          </InlineAlert>
        </div>
      ) : null}
      {state.status === 'ready' && items.length === 0 ? <EmptyState icon={<Trash2 />} title={t('trash.empty.title')} description={t('trash.empty.lead')} /> : null}
      {items.length > 0 ? (
        <DataList columns={columns} aria-label={t('trash.listLabel')}>
          <DataListHeader>
            <DataListHead>{t('trash.col.name')}</DataListHead>
            <DataListHead>{t('trash.col.deletedBy')}</DataListHead>
            <DataListHead>{t('trash.col.deleted')}</DataListHead>
            <DataListHead>{t('trash.col.remaining')}</DataListHead>
            <DataListHead>
              <span className="sr-only">{t('trash.col.actions')}</span>
            </DataListHead>
          </DataListHeader>
          <DataListBody>
            {items.map((item) => (
              <DataListRow key={item.id}>
                <DataListPrimary
                  leading={<FileTile ext={tileText(item.extension)} />}
                  meta={[item.deletedBy?.displayName, formatWhen(item.deletedAt, locale), remaining(item.purgeAt, t), formatBytes(item.size, locale)].filter(Boolean).join(' · ')}
                >
                  <span className="font-medium text-text">{item.name}</span>
                </DataListPrimary>
                <DataListCell desktopOnly className="truncate">
                  {item.deletedBy?.displayName ?? '–'}
                </DataListCell>
                <DataListCell desktopOnly>{formatWhen(item.deletedAt, locale)}</DataListCell>
                <DataListCell desktopOnly>{remaining(item.purgeAt, t)}</DataListCell>
                <DataListCell className="flex items-center justify-end gap-1">
                  <Button loading={busyId === item.id} onClick={() => void restore(item)} {...(item.can.restore ? {} : { disabledReason: t('trash.cannotRestore') })}>
                    <RotateCcw aria-hidden className="size-4" />
                    <span className="sr-only app:not-sr-only">{t('trash.restore')}</span>
                  </Button>
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton label={t('files.menu.label', { name: item.name })} size="sm">
                        <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuItem tone="danger" icon={<Trash2 />} onSelect={() => { setError(null); setPurging(item) }} {...(item.can.purge ? {} : { disabledReason: t('trash.purgeReason') })}>
                        {t('trash.purge')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </DataListCell>
              </DataListRow>
            ))}
          </DataListBody>
        </DataList>
      ) : null}
      {state.status === 'ready' && state.nextCursor !== null ? (
        <div className="flex justify-center py-5">
          <Button loading={state.loadingMore} onClick={() => void loadMore()}>
            {state.loadingMore ? t('trash.loadingMore') : t('trash.more')}
          </Button>
        </div>
      ) : null}
      {purging ? (
        <ConfirmDialog
          open
          title={t('trash.purgeTitle', { name: purging.name })}
          warning={t('trash.purgeWarning')}
          confirmLabel={t('trash.purgeConfirm')}
          busy={working}
          error={error}
          onCancel={() => setPurging(null)}
          onConfirm={() => void purge()}
        />
      ) : null}
      {emptying ? (
        <ConfirmDialog
          open
          title={t('trash.emptyTitle')}
          warning={t('trash.emptyWarning')}
          confirmLabel={working && progress > 0 ? t('trash.emptyProgress', { count: progress }) : t('trash.emptyConfirm')}
          busy={working}
          error={error}
          onCancel={() => (working ? undefined : setEmptying(false))}
          onConfirm={() => void empty()}
        />
      ) : null}
    </>
  )
}
