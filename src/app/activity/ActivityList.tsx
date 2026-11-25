import { Link2, Settings2 } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { useI18n, type I18nKey } from '#/i18n'

/** One row of `listActivity` (src/server/programs/activity.ts): fixed event names and ids; names are resolved by the server. */
export type ActivityItem = {
  readonly id: string
  readonly actorKind: 'user' | 'link' | 'system'
  readonly actorUserId: string | null
  readonly actorName: string | null
  readonly targetKind: string
  readonly targetId: string
  readonly action: string
  readonly outcome: 'allowed' | 'denied'
  /** Unix seconds. */
  readonly createdAt: number
}

export type ActivityCategory = 'all' | 'views' | 'uploads' | 'sharing' | 'members' | 'comments'

const CATEGORY: Readonly<Record<string, ActivityCategory>> = {
  'file.downloaded': 'views',
  'file.previewed': 'views',
  'link.opened': 'views',
  'file.uploaded': 'uploads',
  'file.version_uploaded': 'uploads',
  'file.version_restored': 'uploads',
  'file.access_granted': 'sharing',
  'file.access_revoked': 'sharing',
  'link.created': 'sharing',
  'link.updated': 'sharing',
  'link.revoked': 'sharing',
  'link.copied': 'sharing',
  'link.password_failed': 'sharing',
  'project.access_granted': 'sharing',
  'project.access_revoked': 'sharing',
  'guest.invite_canceled': 'sharing',
  'guest.joined': 'members',
  'member.joined': 'members',
  'member.removed': 'members',
  'member.role_changed': 'members',
  'member.invite_canceled': 'members',
  'workspace.created': 'members',
  'workspace.ownership_transferred': 'members',
  'comment.created': 'comments',
  'comment.deleted': 'comments',
}

export const categoryOf = (action: string): ActivityCategory | null => CATEGORY[action] ?? null

const KNOWN = new Set([
  'file.uploaded', 'file.version_uploaded', 'file.version_restored', 'file.downloaded', 'file.previewed', 'file.renamed', 'file.moved', 'file.trashed',
  'file.restored', 'file.purged', 'file.access_granted', 'file.access_revoked', 'link.created', 'link.updated', 'link.revoked', 'link.copied', 'link.opened',
  'link.password_failed', 'comment.created', 'comment.deleted', 'guest.joined', 'guest.invite_canceled', 'member.joined', 'member.removed', 'member.role_changed',
  'member.invite_canceled', 'project.created', 'project.updated', 'project.archived', 'project.access_granted', 'project.access_revoked',
  'project.access_mode_team', 'project.access_mode_restricted', 'workspace.created', 'workspace.ownership_transferred',
])

const eventKey = (action: string): I18nKey => (KNOWN.has(action) ? (`activity.event.${action}` as I18nKey) : 'activity.event.other')

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** "Bugün", "Dün", "21 Kasım": the heading of a day group. */
const dayHeading = (seconds: number, locale: string, t: ReturnType<typeof useI18n>['t'], now = new Date()) => {
  const date = new Date(seconds * 1000)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return t('activity.today')
  if (days === 1) return t('activity.yesterday')
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) }).format(date)
}

const timeOf = (seconds: number, locale: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(seconds * 1000))

export const actorLabel = (item: Pick<ActivityItem, 'actorKind' | 'actorName'>, t: ReturnType<typeof useI18n>['t']) =>
  item.actorKind === 'link' ? t('activity.link') : item.actorKind === 'system' ? t('activity.system') : (item.actorName ?? t('activity.someone'))

/** The records as one event sentence each, grouped by day, newest first (the order the server returns). */
export const ActivityList = ({ items }: { items: readonly ActivityItem[] }) => {
  const { t, locale } = useI18n()
  const groups: Array<{ heading: string; rows: ActivityItem[] }> = []
  for (const item of items) {
    const heading = dayHeading(item.createdAt, locale, t)
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.rows.push(item)
    else groups.push({ heading, rows: [item] })
  }
  return (
    <div aria-label={t('activity.listLabel')} className="grid gap-5">
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h2 className="mb-1 text-sm font-medium text-text-3">{group.heading}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {group.rows.map((item) => {
              const who = actorLabel(item, t)
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  {item.actorKind === 'link' ? (
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-text-2">
                      <Link2 className="size-4" />
                    </span>
                  ) : item.actorKind === 'system' ? (
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-text-2">
                      <Settings2 className="size-4" />
                    </span>
                  ) : (
                    <Avatar name={who} size="sm" decorative />
                  )}
                  <p className="min-w-0 flex-1 text-md leading-snug [overflow-wrap:anywhere]">
                    <span className="font-medium">{who}</span> {item.outcome === 'denied' ? <span className="text-danger">{t('activity.denied')}</span> : null}
                    {t(eventKey(item.action))}
                  </p>
                  <time dateTime={new Date(item.createdAt * 1000).toISOString()} className="shrink-0 pt-0.5 text-sm text-text-3">
                    {timeOf(item.createdAt, locale)}
                  </time>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
