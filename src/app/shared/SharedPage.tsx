import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Link2, RefreshCw, Share2, Users } from 'lucide-react'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { DataList, DataListBody, DataListCell, DataListHead, DataListHeader, DataListPrimary, DataListRow, FileTile } from '#/components/ui/DataList'
import { EmptyState } from '#/components/ui/EmptyState'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Skeleton } from '#/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useI18n, type I18nKey } from '#/i18n'
import type { SharedByMeItem, SharedPage as Page, SharedWithMeItem } from '#/shared/fileViews'
import type { AppFailure } from '../api'
import { formatBytes, formatDay, formatWhen, tileText } from '../files/format'
import { ShareDialog, type ShareTarget } from '../files/ShareDialog'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'

type State<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: AppFailure }
  | { readonly status: 'ready'; readonly items: readonly T[]; readonly nextCursor: string | null; readonly loadingMore: boolean }

/** A paged shared list (`listSharedWithMe` / `listSharedByMe`), loaded when its tab first opens. */
const useShared = <T,>(operation: string, workspaceId: string) => {
  const { call, expire } = useSession()
  const [state, setState] = useState<State<T>>({ status: 'loading' })
  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const result = await call<Page<T>>(operation, { workspaceId, limit: 30 })
    if (result.ok) setState({ status: 'ready', items: result.data.items, nextCursor: result.data.nextCursor, loadingMore: false })
    else if (result.error === 'Unauthenticated') expire()
    else setState({ status: 'error', failure: result })
  }, [call, expire, operation, workspaceId])
  useEffect(() => {
    void load()
  }, [load])
  const more = async () => {
    if (state.status !== 'ready' || state.nextCursor === null || state.loadingMore) return
    const cursor = state.nextCursor
    setState({ ...state, loadingMore: true })
    const result = await call<Page<T>>(operation, { workspaceId, limit: 30, cursor })
    setState((current) => (current.status !== 'ready' ? current : result.ok ? { status: 'ready', items: [...current.items, ...result.data.items], nextCursor: result.data.nextCursor, loadingMore: false } : { ...current, loadingMore: false }))
  }
  return { state, retry: load, more }
}

const Rows = () => (
  <div role="status" aria-busy="true" className="grid gap-px pt-2">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 border-b border-line px-2 py-3.5">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    ))}
  </div>
)

const Failure = ({ title, onRetry }: { title: string; onRetry: () => void }) => {
  const { t } = useI18n()
  return (
    <div className="py-8">
      <InlineAlert title={title} action={<Button onClick={onRetry}><RefreshCw aria-hidden className="size-4" />{t('common.retry')}</Button>}>
        {t('shared.error.lead')}
      </InlineAlert>
    </div>
  )
}

const MoreButton = ({ loading, onClick }: { loading: boolean; onClick: () => void }) => {
  const { t } = useI18n()
  return (
    <div className="flex justify-center py-5">
      <Button loading={loading} onClick={onClick}>
        {loading ? t('files.loadingMore') : t('files.loadMore')}
      </Button>
    </div>
  )
}

const withMeColumns = 'app:grid-cols-[minmax(0,1fr)_160px_150px_130px_96px]'
const byMeColumns = 'app:grid-cols-[minmax(0,1fr)_130px_120px_130px_150px]'

const WithMe = ({ workspaceId }: { workspaceId: string }) => {
  const { t, locale } = useI18n()
  const list = useShared<SharedWithMeItem>('listSharedWithMe', workspaceId)
  if (list.state.status === 'loading') return <Rows />
  if (list.state.status === 'error') return <Failure title={t('shared.error.title')} onRetry={() => void list.retry()} />
  if (list.state.items.length === 0) return <EmptyState icon={<Share2 />} title={t('shared.empty.withMe.title')} description={t('shared.empty.withMe.lead')} />
  return (
    <>
      <DataList columns={withMeColumns} aria-label={t('shared.listLabel')}>
        <DataListHeader>
          <DataListHead>{t('shared.col.name')}</DataListHead>
          <DataListHead>{t('shared.col.sharedBy')}</DataListHead>
          <DataListHead>{t('shared.col.access')}</DataListHead>
          <DataListHead>{t('shared.col.until')}</DataListHead>
          <DataListHead>
            <span className="sr-only">{t('shared.col.actions')}</span>
          </DataListHead>
        </DataListHeader>
        <DataListBody>
          {list.state.items.map((item) => (
            <DataListRow key={item.id}>
              <DataListPrimary
                leading={<FileTile ext={tileText(item.extension)} />}
                meta={[item.sharedBy ? t('shared.sharer', { name: item.sharedBy.displayName }) : null, t(`share.level.${item.level}` as I18nKey), formatBytes(item.size, locale)].filter(Boolean).join(' · ')}
              >
                <Link to="/app/files/$id" params={{ id: item.id }} className="rounded-sm font-medium text-text hover:underline">
                  {item.name}
                </Link>
              </DataListPrimary>
              <DataListCell desktopOnly className="truncate">
                {item.sharedBy?.displayName ?? '–'}
              </DataListCell>
              <DataListCell desktopOnly>
                <Badge>{t(`share.level.${item.level}` as I18nKey)}</Badge>
              </DataListCell>
              <DataListCell desktopOnly>{item.expiresAt === null ? t('shared.noEnd') : formatDay(item.expiresAt, locale)}</DataListCell>
              <DataListCell className="flex justify-end">
                <Button asChild variant="secondary">
                  <Link to="/app/files/$id" params={{ id: item.id }}>
                    {t('shared.open')}
                  </Link>
                </Button>
              </DataListCell>
            </DataListRow>
          ))}
        </DataListBody>
      </DataList>
      {list.state.nextCursor !== null ? <MoreButton loading={list.state.loadingMore} onClick={() => void list.more()} /> : null}
    </>
  )
}

const ByMe = ({ workspaceId }: { workspaceId: string }) => {
  const { t, locale } = useI18n()
  const list = useShared<SharedByMeItem>('listSharedByMe', workspaceId)
  const [managing, setManaging] = useState<ShareTarget | null>(null)
  if (list.state.status === 'loading') return <Rows />
  if (list.state.status === 'error') return <Failure title={t('shared.error.title')} onRetry={() => void list.retry()} />
  if (list.state.items.length === 0) return <EmptyState icon={<Share2 />} title={t('shared.empty.byMe.title')} description={t('shared.empty.byMe.lead')} />
  const peopleText = (count: number) => (count === 0 ? t('shared.peopleNone') : count === 1 ? t('shared.peopleOne') : t('shared.people', { count }))
  return (
    <>
      <DataList columns={byMeColumns} aria-label={t('shared.listLabel')}>
        <DataListHeader>
          <DataListHead>{t('shared.col.name')}</DataListHead>
          <DataListHead>{t('shared.col.people')}</DataListHead>
          <DataListHead>{t('shared.col.link')}</DataListHead>
          <DataListHead>{t('shared.col.sharedAt')}</DataListHead>
          <DataListHead>
            <span className="sr-only">{t('shared.col.actions')}</span>
          </DataListHead>
        </DataListHeader>
        <DataListBody>
          {list.state.items.map((item) => (
            <DataListRow key={item.id}>
              <DataListPrimary
                leading={<FileTile ext={tileText(item.extension)} />}
                meta={[peopleText(item.grants), item.linkActive ? t('shared.link.on') : null, formatWhen(item.sharedAt, locale)].filter(Boolean).join(' · ')}
              >
                <Link to="/app/files/$id" params={{ id: item.id }} className="rounded-sm font-medium text-text hover:underline">
                  {item.name}
                </Link>
              </DataListPrimary>
              <DataListCell desktopOnly className="flex items-center gap-1.5">
                <Users aria-hidden className="size-4 text-text-3" />
                {peopleText(item.grants)}
              </DataListCell>
              <DataListCell desktopOnly className="flex items-center gap-1.5">
                <Link2 aria-hidden className="size-4 text-text-3" />
                {item.linkActive ? t('shared.link.on') : t('shared.link.off')}
              </DataListCell>
              <DataListCell desktopOnly>{formatWhen(item.sharedAt, locale)}</DataListCell>
              <DataListCell className="flex justify-end">
                <Button onClick={() => setManaging({ id: item.id, name: item.name })}>{t('shared.manage')}</Button>
              </DataListCell>
            </DataListRow>
          ))}
        </DataListBody>
      </DataList>
      {list.state.nextCursor !== null ? <MoreButton loading={list.state.loadingMore} onClick={() => void list.more()} /> : null}
      {managing ? (
        <ShareDialog
          key={managing.id}
          file={managing}
          workspaceId={workspaceId}
          onClose={() => {
            setManaging(null)
            void list.retry()
          }}
        />
      ) : null}
    </>
  )
}

export const SharedPage = () => {
  const { t } = useI18n()
  const { active } = useWorkspace()
  const [tab, setTab] = useState('withMe')
  const guest = active.role === 'guest'
  return (
    <>
      <PageHeader title={t('shared.title')} subtitle={t('shared.subtitle')} />
      <Tabs value={guest ? 'withMe' : tab} onValueChange={setTab}>
        <TabsList aria-label={t('shared.tabs')}>
          <TabsTrigger value="withMe">{t('shared.tab.withMe')}</TabsTrigger>
          {guest ? null : <TabsTrigger value="byMe">{t('shared.tab.byMe')}</TabsTrigger>}
        </TabsList>
        <div className="pt-3">
          <TabsContent value="withMe">
            <WithMe workspaceId={active.id} />
          </TabsContent>
          <TabsContent value="byMe">
            <ByMe workspaceId={active.id} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  )
}
