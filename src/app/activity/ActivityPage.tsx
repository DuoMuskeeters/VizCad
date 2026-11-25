import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Activity as ActivityIcon, RefreshCw, SearchX, ShieldAlert, Upload, UserPlus } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { EmptyState } from '#/components/ui/EmptyState'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { useI18n, type I18nKey } from '#/i18n'
import { useUploads } from '../files/UploadProvider'
import { useSession } from '../session'
import { useLoad } from '../useLoad'
import { useWorkspace } from '../workspace'
import { ActivityList, type ActivityCategory, type ActivityItem, actorLabel, categoryOf } from './ActivityList'

type Page = { items: ActivityItem[]; nextCursor: string | null }

const TYPES: readonly ActivityCategory[] = ['all', 'views', 'uploads', 'sharing', 'members', 'comments']
const EVERYONE = '__all__'
const LINKS = '__links__'

export const ActivityPage = () => {
  const { t } = useI18n()
  const { call } = useSession()
  const { active } = useWorkspace()
  const uploads = useUploads()
  const manager = active.role === 'owner' || active.role === 'admin'
  const first = useLoad<Page>('listActivity', { workspaceId: active.id, limit: 50 })
  const [more, setMore] = useState<{ items: ActivityItem[]; nextCursor: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [type, setType] = useState<ActivityCategory>('all')
  const [person, setPerson] = useState(EVERYONE)

  const loaded = first.state.status === 'ready' ? [...first.state.data.items, ...(more?.items ?? [])] : []
  const nextCursor = more ? more.nextCursor : first.state.status === 'ready' ? first.state.data.nextCursor : null

  const people = useMemo(() => [...new Set(loaded.filter((i) => i.actorKind === 'user').map((i) => actorLabel(i, t)))].sort((a, b) => a.localeCompare(b)), [loaded, t])
  const filtered = loaded.filter((item) => {
    if (type !== 'all' && categoryOf(item.action) !== type) return false
    if (person === EVERYONE) return true
    if (person === LINKS) return item.actorKind === 'link'
    return item.actorKind === 'user' && actorLabel(item, t) === person
  })
  const filtering = type !== 'all' || person !== EVERYONE

  const loadMore = async () => {
    if (nextCursor === null || loadingMore) return
    setLoadingMore(true)
    const result = await call<Page>('listActivity', { workspaceId: active.id, limit: 50, cursor: nextCursor })
    setLoadingMore(false)
    if (result.ok) setMore({ items: [...(more?.items ?? []), ...result.data.items], nextCursor: result.data.nextCursor })
  }

  if (!manager)
    return (
      <>
        <PageHeader title={t('activity.title')} subtitle={t('activity.lead')} />
        <EmptyState icon={<ShieldAlert />} title={t('activity.denied.title')} description={t('activity.denied.lead')} />
      </>
    )

  return (
    <>
      <PageHeader title={t('activity.title')} subtitle={t('activity.lead')} />
      {first.state.status === 'ready' && loaded.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-base text-text-2">
            {t('activity.filter.type')}
            <Select
              variant="inline"
              aria-label={t('activity.filter.type')}
              value={type}
              onValueChange={(value) => setType(value as ActivityCategory)}
              options={TYPES.map((id) => ({ value: id, label: t(`activity.type.${id}` as I18nKey) }))}
            />
          </label>
          <label className="flex items-center gap-2 text-base text-text-2">
            {t('activity.filter.person')}
            <Select
              variant="inline"
              aria-label={t('activity.filter.person')}
              value={person}
              onValueChange={setPerson}
              options={[
                { value: EVERYONE, label: t('activity.person.all') },
                ...people.map((name) => ({ value: name, label: name })),
                { value: LINKS, label: t('activity.person.links') },
              ]}
            />
          </label>
          {filtering ? (
            <Button
              variant="ghost"
              onClick={() => {
                setType('all')
                setPerson(EVERYONE)
              }}
            >
              {t('activity.clear')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {first.state.status === 'loading' ? (
        <div role="status" aria-busy="true" className="grid gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ))}
        </div>
      ) : null}
      {first.state.status === 'error' ? (
        <div className="py-8">
          <InlineAlert title={t('activity.error.title')} action={<Button onClick={() => void first.retry()}><RefreshCw aria-hidden className="size-4" />{t('common.retry')}</Button>}>
            {t('activity.error.lead')}
          </InlineAlert>
        </div>
      ) : null}
      {first.state.status === 'ready' && loaded.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon />}
          title={t('activity.empty.title')}
          description={t('activity.empty.lead')}
          actions={
            <>
              <Button variant="primary" onClick={() => uploads.pick()} {...(uploads.allowed ? {} : { disabledReason: t('files.uploadDenied') })}>
                <Upload aria-hidden className="size-4.5" />
                {t('activity.empty.upload')}
              </Button>
              {active.kind === 'company' ? (
                <Button asChild>
                  <Link to="/app/team">
                    <UserPlus aria-hidden className="size-4.5" />
                    {t('activity.empty.team')}
                  </Link>
                </Button>
              ) : null}
            </>
          }
        />
      ) : null}
      {first.state.status === 'ready' && loaded.length > 0 && filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t('activity.noMatch.title')}
          description={t('activity.noMatch.lead')}
          actions={
            <Button
              onClick={() => {
                setType('all')
                setPerson(EVERYONE)
              }}
            >
              {t('activity.clear')}
            </Button>
          }
        />
      ) : null}
      {filtered.length > 0 ? <ActivityList items={filtered} /> : null}
      {first.state.status === 'ready' && nextCursor !== null ? (
        <div className="flex justify-center py-5">
          <Button loading={loadingMore} onClick={() => void loadMore()}>
            {t('activity.more')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
