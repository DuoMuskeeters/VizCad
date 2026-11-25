import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { isEmail } from '#/components/ui/ChipsInput'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { SwitchRow } from '#/components/ui/Switch'
import { useToast } from '#/components/ui/Toast'
import { useI18n, type I18nKey } from '#/i18n'
import type { FileAccessEntry, FileAccessList } from '#/shared/fileViews'
import type { MemberView, TeamData } from '../api'
import { failureKey } from '../errors'
import { formatDay, fromDateInput, toDateInput } from '../files/format'
import { useSession, useUser } from '../session'

const DAY = 86_400
const nowSeconds = () => Math.floor(Date.now() / 1000)
const DEFAULT_DAYS = 30

type Level = FileAccessEntry['level']
const LEVELS: readonly Level[] = ['view', 'comment', 'download', 'edit']

export type AccessTarget = { readonly kind: 'file'; readonly fileId: string } | { readonly kind: 'project'; readonly projectId: string }

type Candidate = { readonly kind: 'member'; readonly member: MemberView } | { readonly kind: 'guest'; readonly email: string }

const targetBody = (target: AccessTarget) => (target.kind === 'file' ? { fileId: target.fileId } : { projectId: target.projectId })
const ops = (target: AccessTarget) =>
  target.kind === 'file'
    ? { list: 'listFileAccess', grant: 'grantFileAccess', revoke: 'revokeFileAccess' }
    : { list: 'listProjectAccess', grant: 'grantProjectAccess', revoke: 'revokeProjectAccess' }

const roleKey = (role: FileAccessEntry['role']): I18nKey => `access.role.${role}` as I18nKey

const editReasonFor = (role: string | undefined, t: ReturnType<typeof useI18n>['t']): string | null =>
  role === 'guest' ? t('share.level.editGuest') : role === 'commenter' ? t('share.level.editCommenter') : null

type ListState = { readonly status: 'loading' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly list: FileAccessList }

/**
 * Who can open a file or project, with the form to add people (docs/03 §2.3, docs/09 §5.1). The list comes from the
 * server: whoever may not manage sharing sees only their own row (D20). Changing a level calls the same grant operation
 * again; removing calls revoke. Guests need an end date; the server holds the plan ceiling.
 */
export const AccessPanel = ({ workspaceId, target }: { workspaceId: string; target: AccessTarget }) => {
  const { t, locale } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const me = useUser()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [members, setMembers] = useState<readonly MemberView[]>([])
  const [text, setText] = useState('')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [level, setLevel] = useState<Level>('view')
  const [ends, setEnds] = useState(() => toDateInput(nowSeconds() + DEFAULT_DAYS * DAY))
  const [limited, setLimited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const operation = ops(target)
  const targetKey = target.kind === 'file' ? target.fileId : target.projectId

  const load = useCallback(async () => {
    const result = await call<FileAccessList>(operation.list, { workspaceId, ...targetBody(target) })
    setState(result.ok ? { status: 'ready', list: result.data } : { status: 'error' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, workspaceId, operation.list, targetKey])

  useEffect(() => {
    setState({ status: 'loading' })
    void load()
  }, [load])

  const canManage = state.status === 'ready' && state.list.canManage
  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    void call<TeamData>('listMembers', { workspaceId }).then((result) => {
      if (!cancelled && result.ok) setMembers(result.data.members.filter((member) => member.userId !== me.id))
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, me.id, canManage])

  const query = text.trim().toLowerCase()
  const matches = useMemo(
    () => (query === '' ? [] : members.filter((member) => member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)).slice(0, 5)),
    [members, query],
  )
  const guestEmail = isEmail(text.trim()) && !members.some((member) => member.email.toLowerCase() === query) ? text.trim() : null

  const guest = candidate?.kind === 'guest' || (candidate?.kind === 'member' && candidate.member.role === 'guest')
  const candidateRole = candidate?.kind === 'member' ? candidate.member.role : candidate?.kind === 'guest' ? 'guest' : undefined
  const needsDate = guest || limited
  const editReason = editReasonFor(candidateRole, t)

  const pick = (next: Candidate) => {
    setCandidate(next)
    setText('')
    setError(null)
    if (level === 'edit' && (next.kind === 'guest' || next.member.role === 'guest' || next.member.role === 'commenter')) setLevel('view')
  }

  const submit = async () => {
    if (candidate === null) return setError(t('share.people.pickFirst'))
    const expiresAt = needsDate ? fromDateInput(ends) : null
    if (needsDate && (expiresAt === null || expiresAt <= nowSeconds())) return setError(t('share.people.pastDate'))
    setBusy(true)
    setError(null)
    if (candidate.kind === 'member') {
      const member = candidate.member
      const result = await call(operation.grant, { workspaceId, ...targetBody(target), userId: member.userId, level, expiresAt })
      setBusy(false)
      if (!result.ok) return setError(t(failureKey(result)))
      toast({ title: target.kind === 'file' ? t('share.people.addedMember', { name: member.name }) : t('access.projectAddedMember', { name: member.name }), tone: 'success' })
    } else {
      const email = candidate.email
      const result = await call('inviteGuest', {
        workspaceId, ...targetBody(target), email, level: level === 'edit' ? 'view' : level, accessExpiresAt: expiresAt,
      })
      setBusy(false)
      if (!result.ok) return setError(t(failureKey(result)))
      toast({ title: t('share.people.invited', { email }), tone: 'success' })
    }
    setCandidate(null)
    setLimited(false)
    void load()
  }

  const changeLevel = async (entry: FileAccessEntry, next: Level) => {
    if (next === entry.level) return
    setRowBusy(entry.userId)
    const result = await call(operation.grant, { workspaceId, ...targetBody(target), userId: entry.userId, level: next, expiresAt: entry.expiresAt })
    setRowBusy(null)
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    toast({ title: t('access.changed', { name: entry.name }) })
    void load()
  }

  const remove = async (entry: FileAccessEntry) => {
    setRowBusy(entry.userId)
    const result = await call(operation.revoke, { workspaceId, ...targetBody(target), userId: entry.userId })
    setRowBusy(null)
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    toast({ title: t('access.removed') })
    void load()
  }

  const cancelInvitation = async (id: string) => {
    setRowBusy(id)
    const result = await call('revokeGuestInvitation', { workspaceId, invitationId: id })
    setRowBusy(null)
    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
    toast({ title: t('access.invitationCanceled') })
    void load()
  }

  const adder =
    candidate === null ? (
      <div className="grid gap-2">
        <Field label={t('share.people.label')} hint={t('share.people.hint')}>
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t('share.people.placeholder')} autoComplete="off" />
        </Field>
        {query !== '' ? (
          <ul aria-label={t('share.people.suggestions')} className="grid gap-px rounded-md border border-line p-1">
            {matches.map((member) => (
              <li key={member.userId}>
                <button type="button" onClick={() => pick({ kind: 'member', member })} className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left hover:bg-hover app:min-h-10">
                  <Avatar name={member.name} size="sm" decorative />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-md">{member.name}</span>
                    <span className="block truncate text-sm text-text-3">{member.email}</span>
                  </span>
                  {member.role === 'guest' ? <Badge tone="guest">{t('share.people.guest')}</Badge> : null}
                </button>
              </li>
            ))}
            {guestEmail ? (
              <li>
                <button type="button" onClick={() => pick({ kind: 'guest', email: guestEmail })} className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left hover:bg-hover app:min-h-10">
                  <UserPlus aria-hidden className="size-4.5 text-text-2" />
                  <span className="min-w-0 flex-1 truncate text-md">{t('share.people.guestOption', { email: guestEmail })}</span>
                </button>
              </li>
            ) : null}
            {matches.length === 0 && !guestEmail ? <li className="px-2 py-2.5 text-sm text-text-3">{t('share.people.noMatch')}</li> : null}
          </ul>
        ) : null}
      </div>
    ) : (
      <div className="grid gap-3 rounded-md border border-line p-3">
        <div className="flex items-center gap-3">
          <Avatar name={candidate.kind === 'member' ? candidate.member.name : candidate.email} size="sm" decorative />
          <span className="min-w-0 flex-1 truncate text-md font-medium">{candidate.kind === 'member' ? candidate.member.name : candidate.email}</span>
          {guest ? <Badge tone="guest">{t('share.people.guest')}</Badge> : null}
          <IconButton label={t('common.cancel')} size="sm" onClick={() => setCandidate(null)}>
            <X aria-hidden className="size-4" />
          </IconButton>
        </div>
        <Field label={t('share.people.level')} {...(editReason ? { hint: editReason } : {})}>
          <Select
            value={level}
            onValueChange={(value) => setLevel(value as Level)}
            options={LEVELS.map((id) => ({ value: id, label: t(`share.level.${id}` as I18nKey), disabled: id === 'edit' && editReason !== null }))}
          />
        </Field>
        {guest ? null : <SwitchRow label={t('share.people.expiry')} description={limited ? undefined : t('share.people.expiryOptional')} checked={limited} onCheckedChange={setLimited} />}
        {needsDate ? (
          <Field label={t('share.people.expiry')} {...(guest ? { hint: t('share.people.expiryRequired') } : {})}>
            <Input type="date" value={ends} min={toDateInput(nowSeconds() + DAY)} onChange={(event) => setEnds(event.target.value)} />
          </Field>
        ) : null}
        <Button variant="primary" loading={busy} onClick={() => void submit()} className="justify-self-end">
          {t('share.people.add')}
        </Button>
      </div>
    )

  return (
    <section aria-labelledby="share-people" className="grid gap-3">
      <h3 id="share-people" className="text-lg font-heading tracking-heading">
        {t('share.people.title')}
      </h3>
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true" aria-label={t('access.loading')} className="grid gap-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : null}
      {state.status === 'error' ? (
        <InlineAlert title={t('access.loadError')} action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}>
          {t('files.error.lead')}
        </InlineAlert>
      ) : null}
      {state.status === 'ready' ? (
        <>
          {state.list.canManage ? adder : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <h4 className="text-md font-medium">{t('access.title')}</h4>
          {state.list.canManage && state.list.people.length === 0 && state.list.invitations.length === 0 ? <p className="text-sm text-text-3">{t('access.nobody')}</p> : null}
          {state.list.people.length > 0 ? (
            <ul className="divide-y divide-line">
              {state.list.people.map((entry) => {
                const editable = state.list.canManage && entry.source === 'grant' && !entry.self
                const reasonEdit = editReasonFor(entry.role, t)
                const meta = [t(roleKey(entry.role)), entry.email].join(' · ')
                const until =
                  entry.expiresAt === null
                    ? entry.source === 'uploader' ? t('access.owner') : t('access.noEnd')
                    : entry.expired ? t('access.expired', { date: formatDay(entry.expiresAt, locale) }) : t('access.untilDate', { date: formatDay(entry.expiresAt, locale) })
                return (
                  <li key={entry.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Avatar name={entry.name} size="sm" decorative />
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="flex items-center gap-2 text-md">
                        <span className="truncate">{entry.name}</span>
                        {entry.self ? <span className="shrink-0 text-sm text-text-3">({t('access.you')})</span> : null}
                        {entry.role === 'guest' ? <Badge tone="guest">{t('share.people.guest')}</Badge> : null}
                      </p>
                      <p className="truncate text-sm text-text-3">{meta}</p>
                      <p className={entry.expired ? 'truncate text-sm text-danger' : 'truncate text-sm text-text-3'}>{until}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {editable ? (
                        <Select
                          variant="inline"
                          aria-label={t('access.level', { name: entry.name })}
                          value={entry.level}
                          disabled={rowBusy === entry.userId}
                          onValueChange={(value) => void changeLevel(entry, value as Level)}
                          options={LEVELS.map((id) => ({
                            value: id,
                            label: t(`share.level.${id}` as I18nKey),
                            disabled: id === 'edit' && reasonEdit !== null,
                            ...(id === 'edit' && reasonEdit !== null ? { description: reasonEdit } : {}),
                          }))}
                        />
                      ) : (
                        <span className="px-2.5 text-md text-text-2">{t(`share.level.${entry.level}` as I18nKey)}</span>
                      )}
                      {entry.source === 'grant' && !entry.self ? (
                        <IconButton
                          label={t('access.remove', { name: entry.name })}
                          size="sm"
                          loading={rowBusy === entry.userId}
                          onClick={() => void remove(entry)}
                          {...(entry.canRevoke ? {} : { disabledReason: t('access.removeReason') })}
                        >
                          <X aria-hidden className="size-4" />
                        </IconButton>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {state.list.invitations.length > 0 ? (
            <div className="grid gap-1">
              <h4 className="text-md font-medium">{t('access.invitations')}</h4>
              <ul className="divide-y divide-line">
                {state.list.invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={invitation.email} size="sm" decorative />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-md">
                        <span className="truncate">{invitation.email}</span>
                        <Badge tone="guest">{t('share.people.guest')}</Badge>
                      </p>
                      <p className="truncate text-sm text-text-3">
                        {t('access.invitationMeta', { level: t(`share.level.${invitation.level}` as I18nKey), date: formatDay(invitation.accessExpiresAt, locale) })}
                      </p>
                    </div>
                    <IconButton label={t('access.cancelInvitation', { email: invitation.email })} size="sm" loading={rowBusy === invitation.id} onClick={() => void cancelInvitation(invitation.id)}>
                      <X aria-hidden className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-text-3">{state.list.canManage ? t('access.guestSeats') : t('access.onlyYou')}</p>
        </>
      ) : null}
    </section>
  )
}
