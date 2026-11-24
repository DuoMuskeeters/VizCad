import { useCallback, useEffect, useState } from 'react'
import { Building2, EllipsisVertical, Trash2, UserCheck, UserPlus, Users } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { DataList, DataListBody, DataListCell, DataListHead, DataListHeader, DataListPrimary, DataListRow } from '#/components/ui/DataList'
import { EmptyState } from '#/components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { useI18n } from '#/i18n'
import type { InvitationView, MemberView, TeamData, WorkspaceSummary } from '../api'
import { CreateWorkspaceDialog } from '../CreateWorkspaceDialog'
import { failureKey } from '../errors'
import { assignableRoles, canManageMembers, canManageTarget, isDemotion, roleKey, type InternalRole } from '../roles'
import { useSession, useUser } from '../session'
import { useWorkspace } from '../workspace'
import { ConfirmDialog } from './ConfirmDialog'
import { InviteDialog } from './InviteDialog'
import { RemovalPreviewList } from './RemovalPreview'

const memberColumns = 'app:grid-cols-[minmax(0,1fr)_180px_130px_44px]'
const guestColumns = 'app:grid-cols-[minmax(0,1fr)_130px_44px]'
const inviteColumns = 'app:grid-cols-[minmax(0,1fr)_120px_190px_auto]'

type Pending =
  | { kind: 'remove'; member: MemberView }
  | { kind: 'role'; member: MemberView; role: InternalRole }
  | { kind: 'promote'; member: MemberView; role: 'member' | 'commenter' }

export const useTeam = (workspaceId: string) => {
  const { call, expire } = useSession()
  const [data, setData] = useState<TeamData | null>(null)
  const [failure, setFailure] = useState<{ error: string; reason?: string } | null>(null)
  const load = useCallback(async () => {
    const result = await call<TeamData>('listMembers', { workspaceId })
    if (result.ok) {
      setData(result.data)
      setFailure(null)
    } else if (result.error === 'Unauthenticated') expire()
    else setFailure(result)
  }, [call, expire, workspaceId])
  useEffect(() => {
    setData(null)
    void load()
  }, [load])
  return { data, failure, reload: load }
}

const useFormatters = () => {
  const { locale } = useI18n()
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return { date: (seconds: number) => date.format(new Date(seconds * 1000)) }
}

const PersonCell = ({ member, you, meta }: { member: MemberView; you: boolean; meta?: string }) => {
  const { t } = useI18n()
  return (
    <DataListPrimary leading={<Avatar name={member.name} />} meta={meta ?? member.email}>
      <span>{member.name}</span>
      {you ? <span className="ml-1.5 font-regular text-text-3">{t('app.team.you')}</span> : null}
      <span className="hidden truncate text-sm font-regular text-text-3 app:block">{member.email}</span>
    </DataListPrimary>
  )
}

const MemberRow = ({
  member,
  you,
  workspace,
  onRole,
  onRemove,
  onPromote,
  promoteDisabled,
}: {
  member: MemberView
  you: boolean
  workspace: WorkspaceSummary
  onRole: (member: MemberView, role: InternalRole) => void
  onPromote: (member: MemberView, role: 'member' | 'commenter') => void
  /** Why promoting is not possible right now (no free seat), or undefined. */
  promoteDisabled: string | undefined
  onRemove: (member: MemberView) => void
}) => {
  const { t } = useI18n()
  const { date } = useFormatters()
  const ability = canManageTarget(workspace, member.role, you)
  const editable = ability.allowed && member.role !== 'guest'
  const roles = assignableRoles(workspace.role)
  const roleLabel = t(roleKey(member.role))
  return (
    <DataListRow>
      <PersonCell member={member} you={you} meta={`${member.email} · ${roleLabel}`} />
      <DataListCell desktopOnly>
        {editable ? (
          <Select
            variant="inline"
            aria-label={t('app.team.roleOf', { name: member.name })}
            value={member.role}
            onValueChange={(value) => onRole(member, value as InternalRole)}
            options={roles.map((r) => ({ value: r, label: t(roleKey(r)) }))}
          />
        ) : (
          <span title={ability.allowed ? undefined : t(ability.reason)}>{roleLabel}</span>
        )}
      </DataListCell>
      <DataListCell desktopOnly>{date(member.joinedAt)}</DataListCell>
      <DataListCell className="flex justify-end">
        <Menu>
          <MenuTrigger asChild>
            <IconButton label={t('app.team.actionsOf', { name: member.name })} size="sm">
              <EllipsisVertical aria-hidden className="size-4.5 rotate-90" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-60">
            {editable ? (
              <>
                <MenuLabel>{t('app.team.changeRole')}</MenuLabel>
                <MenuRadioGroup value={member.role} onValueChange={(value) => onRole(member, value as InternalRole)}>
                  {roles.map((r) => (
                    <MenuRadioItem key={r} value={r}>
                      {t(roleKey(r))}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
              </>
            ) : null}
            {member.role === 'guest' && ability.allowed ? (
              <>
                <MenuLabel>{t('app.team.promote.label')}</MenuLabel>
                {(['member', 'commenter'] as const).map((r) => (
                  <MenuItem key={r} icon={<UserCheck />} {...(promoteDisabled === undefined ? {} : { disabledReason: promoteDisabled })} onSelect={() => onPromote(member, r)}>
                    {t(r === 'member' ? 'app.team.promote.member' : 'app.team.promote.commenter')}
                  </MenuItem>
                ))}
                <MenuSeparator />
              </>
            ) : null}
            <MenuItem
              tone="danger"
              icon={<Trash2 />}
              {...(ability.allowed ? {} : { disabledReason: t(ability.reason) })}
              onSelect={() => onRemove(member)}
            >
              {t('app.team.remove')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </DataListCell>
    </DataListRow>
  )
}

const InvitationRow = ({
  invitation,
  busy,
  onResend,
  onRevoke,
}: {
  invitation: InvitationView
  busy: boolean
  onResend: (i: InvitationView) => void
  onRevoke: (i: InvitationView) => void
}) => {
  const { t } = useI18n()
  const days = Math.max(1, Math.ceil((invitation.expiresAt * 1000 - Date.now()) / 86_400_000))
  const expires = t('app.team.expiresIn', { days })
  return (
    <DataListRow className="max-app:grid-cols-1! max-app:gap-y-1 max-app:py-3">
      <DataListPrimary leading={<Avatar name={invitation.email} tone="slate" />} meta={`${t(roleKey(invitation.role))} · ${expires}`}>
        {invitation.email}
      </DataListPrimary>
      <DataListCell desktopOnly>{t(roleKey(invitation.role))}</DataListCell>
      <DataListCell desktopOnly>{expires}</DataListCell>
      <DataListCell className="flex flex-wrap gap-1 app:justify-end max-app:-ml-1">
        <Button loading={busy} onClick={() => onResend(invitation)} className="h-11 app:h-8 app:text-sm">
          {t('app.team.resend')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onRevoke(invitation)} className="h-11 app:h-8 app:text-sm">
          {t('app.team.revoke')}
        </Button>
      </DataListCell>
    </DataListRow>
  )
}

const TeamSkeleton = () => (
  <div className="grid gap-3" aria-busy="true">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
)

export const TeamPage = () => {
  const { t } = useI18n()
  const user = useUser()
  const { call } = useSession()
  const { active } = useWorkspace()
  const { toast } = useToast()
  const { data, failure, reload } = useTeam(active.id)
  const [inviting, setInviting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const manage = canManageMembers(active)

  if (active.kind === 'personal')
    return (
      <>
        <PageHeader title={t('app.team.title')} />
        <EmptyState
          icon={<Users />}
          title={t('app.team.personal.title')}
          description={t('app.team.personal.lead')}
          actions={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Building2 aria-hidden className="size-4.5" />
              {t('app.team.personal.cta')}
            </Button>
          }
          note={t('app.team.personal.note')}
        />
        <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
      </>
    )

  const fail = (result: { error: string; reason?: string }) => toast({ title: t(failureKey(result)), tone: 'danger' })

  const applyRole = async (member: MemberView, role: InternalRole) => {
    setBusy(true)
    const result = await call('changeRole', { workspaceId: active.id, userId: member.userId, role })
    setBusy(false)
    if (!result.ok) return setDialogError(t(failureKey(result)))
    setPending(null)
    setDialogError(null)
    toast({ title: t('app.team.roleChanged', { name: member.name, role: t(roleKey(role)) }), tone: 'success' })
    await reload()
  }

  const requestRole = (member: MemberView, role: InternalRole) => {
    if (role === member.role) return
    if (isDemotion(member.role, role)) {
      setDialogError(null)
      return setPending({ kind: 'role', member, role })
    }
    void applyRole(member, role)
  }

  const requestPromote = (member: MemberView, role: 'member' | 'commenter') => {
    setDialogError(null)
    setPending({ kind: 'promote', member, role })
  }

  const applyRemove = async (member: MemberView) => {
    setBusy(true)
    const result = await call('removeMember', { workspaceId: active.id, userId: member.userId })
    setBusy(false)
    if (!result.ok) return setDialogError(t(failureKey(result)))
    setPending(null)
    setDialogError(null)
    toast({ title: t('app.team.removed', { name: member.name }), tone: 'success' })
    await reload()
  }

  const resend = async (invitation: InvitationView) => {
    setRowBusy(invitation.id)
    const result = await call('inviteMember', { workspaceId: active.id, email: invitation.email, role: invitation.role })
    setRowBusy(null)
    if (!result.ok) return fail(result)
    toast({ title: t('app.team.resent', { email: invitation.email }), tone: 'success' })
    await reload()
  }

  const revoke = async (invitation: InvitationView) => {
    setRowBusy(invitation.id)
    const result = await call('revokeInvitation', { workspaceId: active.id, invitationId: invitation.id })
    setRowBusy(null)
    if (!result.ok) return fail(result)
    toast({ title: t('app.team.revoked', { email: invitation.email }), tone: 'success' })
    await reload()
  }

  const members = (data?.members ?? []).filter((m) => m.role !== 'guest')
  const guests = (data?.members ?? []).filter((m) => m.role === 'guest')
  const invitations = data?.invitations ?? []
  const usage = data?.usage ?? null
  const seatsUsed = usage?.seats.used ?? members.length + invitations.length
  const seatLimit = usage?.seats.limit ?? null
  const seatsFull = seatLimit !== null && seatsUsed >= seatLimit
  const guestLimit = usage?.guests.limit ?? null
  const guestsUsed = usage?.guests.used ?? guests.length
  const inviteDisabled = !manage.allowed ? t(manage.reason) : seatsFull ? t('app.team.reason.seatsFull', { limit: seatLimit ?? 0 }) : undefined
  const commenters = members.filter((m) => m.role === 'commenter').length
  const iAmGuest = active.role === 'guest'
  const demote = pending?.kind === 'role' && pending
  const promote = pending?.kind === 'promote' && pending
  const promoteDisabled = seatsFull ? t('app.team.reason.seatsFull', { limit: seatLimit ?? 0 }) : undefined
  const manager = manage.allowed

  return (
    <>
      <PageHeader
        title={t('app.team.title')}
        subtitle={t('app.team.subtitle', { name: active.name })}
        actions={
          <Button
            variant="primary"
            onClick={() => setInviting(true)}
            {...(inviteDisabled === undefined ? {} : { disabledReason: inviteDisabled })}
          >
            <UserPlus aria-hidden className="size-4.5" />
            {t('app.team.invite.open')}
          </Button>
        }
      />

      {failure ? (
        <InlineAlert title={t('app.error.loadTitle')} action={<Button onClick={() => void reload()}>{t('common.retry')}</Button>}>
          {t(failureKey(failure))}
        </InlineAlert>
      ) : !data ? (
        <TeamSkeleton />
      ) : iAmGuest ? (
        <div className="grid gap-4">
          <Notice>{t('app.team.guestView')}</Notice>
          <DataList columns={guestColumns} aria-label={t('app.team.title')}>
            <DataListBody>
              {data.members.map((m) => (
                <DataListRow key={m.userId}>
                  <PersonCell member={m} you={m.userId === user.id} />
                  <DataListCell desktopOnly>
                    <Badge tone="guest">{t('app.role.guest')}</Badge>
                  </DataListCell>
                  <DataListCell desktopOnly>{''}</DataListCell>
                </DataListRow>
              ))}
            </DataListBody>
          </DataList>
        </div>
      ) : (
        <div className="grid gap-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-line px-4 py-3.5 text-base">
            <div>
              <dt className="text-text-3">{t('app.team.stat.seats')}</dt>
              <dd className="text-lg font-semibold">{seatLimit === null ? seatsUsed : t('app.team.stat.of', { used: seatsUsed, limit: seatLimit })}</dd>
            </div>
            <div>
              <dt className="text-text-3">{t('app.team.stat.commenters')}</dt>
              <dd className="text-lg font-semibold">{commenters}</dd>
            </div>
            <div>
              <dt className="text-text-3">{t('app.team.stat.guests')}</dt>
              <dd className="text-lg font-semibold">{guestLimit === null ? guestsUsed : t('app.team.stat.of', { used: guestsUsed, limit: guestLimit })}</dd>
            </div>
            <p className="self-end text-sm text-text-3">{t('app.team.stat.note')}</p>
          </dl>

          <Tabs defaultValue="members">
            <TabsList aria-label={t('app.team.sections')}>
              <TabsTrigger value="members" count={members.length}>
                {t('app.team.tab.members')}
              </TabsTrigger>
              <TabsTrigger value="guests" count={guests.length}>
                {t('app.team.tab.guests')}
              </TabsTrigger>
              {manager ? (
                <TabsTrigger value="invitations" count={invitations.length}>
                  {t('app.team.tab.invitations')}
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="members" className="pt-3">
              <DataList columns={memberColumns} aria-label={t('app.team.tab.members')}>
                <DataListHeader>
                  <DataListHead>{t('app.team.col.person')}</DataListHead>
                  <DataListHead>{t('app.team.col.role')}</DataListHead>
                  <DataListHead>{t('app.team.col.joined')}</DataListHead>
                  <DataListHead>
                    <span className="sr-only">{t('app.team.col.actions')}</span>
                  </DataListHead>
                </DataListHeader>
                <DataListBody>
                  {members.map((m) => (
                    <MemberRow key={m.userId} member={m} you={m.userId === user.id} workspace={active} onRole={requestRole} onPromote={requestPromote} promoteDisabled={promoteDisabled} onRemove={(member) => { setDialogError(null); setPending({ kind: 'remove', member }) }} />
                  ))}
                </DataListBody>
              </DataList>
              {!manager ? <p className="mt-3 text-sm text-text-3">{t('app.team.pendingHidden')}</p> : null}
            </TabsContent>

            <TabsContent value="guests" className="pt-3">
              {guests.length === 0 ? (
                <p className="py-8 text-center text-base text-text-3">{t('app.team.guests.empty')}</p>
              ) : (
                <DataList columns={memberColumns} aria-label={t('app.team.tab.guests')}>
                  <DataListHeader>
                    <DataListHead>{t('app.team.col.person')}</DataListHead>
                    <DataListHead>{t('app.team.col.role')}</DataListHead>
                    <DataListHead>{t('app.team.col.joined')}</DataListHead>
                    <DataListHead>
                      <span className="sr-only">{t('app.team.col.actions')}</span>
                    </DataListHead>
                  </DataListHeader>
                  <DataListBody>
                    {guests.map((m) => (
                      <MemberRow key={m.userId} member={m} you={false} workspace={active} onRole={requestRole} onPromote={requestPromote} promoteDisabled={promoteDisabled} onRemove={(member) => { setDialogError(null); setPending({ kind: 'remove', member }) }} />
                    ))}
                  </DataListBody>
                </DataList>
              )}
            </TabsContent>

            {manager ? (
              <TabsContent value="invitations" className="pt-3">
                {invitations.length === 0 ? (
                  <p className="py-8 text-center text-base text-text-3">{t('app.team.invitations.empty')}</p>
                ) : (
                  <DataList columns={inviteColumns} aria-label={t('app.team.tab.invitations')}>
                    <DataListBody>
                      {invitations.map((i) => (
                        <InvitationRow key={i.id} invitation={i} busy={rowBusy === i.id} onResend={(v) => void resend(v)} onRevoke={(v) => void revoke(v)} />
                      ))}
                    </DataListBody>
                  </DataList>
                )}
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} call={call} workspaceId={active.id} actorRole={active.role} onDone={() => void reload()} />

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        error={dialogError}
        extra={pending?.kind === 'remove' ? <RemovalPreviewList call={call} workspaceId={active.id} userId={pending.member.userId} /> : undefined}
        onCancel={() => setPending(null)}
        title={promote ? t('app.team.promote.title', { name: promote.member.name, role: t(roleKey(promote.role)) }) : demote ? t('app.team.confirm.roleTitle', { name: demote.member.name }) : t('app.team.confirm.removeTitle', { name: pending?.member.name ?? '' })}
        description={promote ? t('app.team.promote.lead', { name: promote.member.name, workspace: active.name }) : demote ? t('app.team.confirm.roleLead', { from: t(roleKey(demote.member.role)), to: t(roleKey(demote.role)) }) : t('app.team.confirm.removeLead', { name: pending?.member.name ?? '', workspace: active.name })}
        warning={promote ? t('app.team.promote.warning', { used: seatsUsed + 1, limit: seatLimit ?? seatsUsed + 1 }) : demote ? t('app.team.confirm.roleWarning') : t('app.team.confirm.removeWarning')}
        confirmLabel={promote ? t('app.team.promote.btn', { role: t(roleKey(promote.role)) }) : demote ? t('app.team.confirm.roleBtn') : t('app.team.confirm.removeBtn')}
        {...(promote ? { confirmVariant: 'primary' as const, warningTone: 'info' as const } : {})}
        onConfirm={() => {
          if (!pending) return
          if (pending.kind === 'role' || pending.kind === 'promote') void applyRole(pending.member, pending.role)
          else void applyRemove(pending.member)
        }}
      />
    </>
  )
}
