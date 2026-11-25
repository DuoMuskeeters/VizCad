import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Link2, UserPlus, X } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { isEmail } from '#/components/ui/ChipsInput'
import { Dialog, DialogContent } from '#/components/ui/Dialog'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { InlineAlert, Notice } from '#/components/ui/Notice'
import { SegmentedControl } from '#/components/ui/SegmentedControl'
import { Select } from '#/components/ui/Select'
import { Skeleton } from '#/components/ui/Skeleton'
import { SwitchRow } from '#/components/ui/Switch'
import { useToast } from '#/components/ui/Toast'
import { useI18n, type I18nKey } from '#/i18n'
import type { MemberView, TeamData } from '../api'
import { failureKey } from '../errors'
import { useSession, useUser } from '../session'
import { formatDay, fromDateInput, toDateInput } from './format'
import type { AnyFileView, LinkLevel, ShareLinkSummary } from './types'

const DAY = 86_400
const nowSeconds = () => Math.floor(Date.now() / 1000)
const DEFAULT_LINK_DAYS = 30

type AccessLevel = 'view' | 'comment' | 'download' | 'edit'
const LEVELS: readonly AccessLevel[] = ['view', 'comment', 'download', 'edit']

type Candidate = { readonly kind: 'member'; readonly member: MemberView } | { readonly kind: 'guest'; readonly email: string }

type Added = { readonly key: string; readonly name: string; readonly detail: string; readonly guest: boolean; readonly revoke: () => Promise<boolean> }

/** ---- People ------------------------------------------------------------------------------------------------ */

const PeopleSection = ({ file, workspaceId }: { file: AnyFileView; workspaceId: string }) => {
  const { t, locale } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const me = useUser()
  const [members, setMembers] = useState<readonly MemberView[]>([])
  const [text, setText] = useState('')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [level, setLevel] = useState<AccessLevel>('view')
  const [ends, setEnds] = useState(() => toDateInput(nowSeconds() + DEFAULT_LINK_DAYS * DAY))
  const [limited, setLimited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<readonly Added[]>([])

  useEffect(() => {
    let cancelled = false
    void call<TeamData>('listMembers', { workspaceId }).then((result) => {
      if (!cancelled && result.ok) setMembers(result.data.members.filter((member) => member.userId !== me.id))
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, me.id])

  const query = text.trim().toLowerCase()
  const matches = useMemo(
    () => (query === '' ? [] : members.filter((member) => member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)).slice(0, 5)),
    [members, query],
  )
  const guestEmail = isEmail(text.trim()) && !members.some((member) => member.email.toLowerCase() === query) ? text.trim() : null

  const guest = candidate?.kind === 'guest' || (candidate?.kind === 'member' && candidate.member.role === 'guest')
  const commenter = candidate?.kind === 'member' && candidate.member.role === 'commenter'
  const needsDate = guest || limited
  const editReason = guest ? t('share.level.editGuest') : commenter ? t('share.level.editCommenter') : null

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
      const result = await call('grantFileAccess', { workspaceId, fileId: file.id, userId: member.userId, level, expiresAt })
      setBusy(false)
      if (!result.ok) return setError(t(failureKey(result)))
      setAdded((current) => [
        ...current.filter((item) => item.key !== member.userId),
        {
          key: member.userId,
          name: member.name,
          guest: member.role === 'guest',
          detail: `${t(`share.level.${level}` as I18nKey)}${expiresAt === null ? '' : ` · ${t('share.people.accessUntil', { date: formatDay(expiresAt, locale) })}`}`,
          revoke: async () => (await call('revokeFileAccess', { workspaceId, fileId: file.id, userId: member.userId })).ok,
        },
      ])
      toast({ title: t('share.people.addedMember', { name: member.name }), tone: 'success' })
    } else {
      const email = candidate.email
      const result = await call<{ invitationId: string }>('inviteGuest', {
        workspaceId,
        fileId: file.id,
        email,
        level: level === 'edit' ? 'view' : level,
        accessExpiresAt: expiresAt,
      })
      setBusy(false)
      if (!result.ok) return setError(t(failureKey(result)))
      const invitationId = result.data.invitationId
      setAdded((current) => [
        ...current,
        {
          key: invitationId,
          name: email,
          guest: true,
          detail: `${t('share.people.invitePending', { date: formatDay(expiresAt ?? 0, locale) })} · ${t(`share.level.${level === 'edit' ? 'view' : level}` as I18nKey)}`,
          revoke: async () => (await call('revokeGuestInvitation', { workspaceId, invitationId })).ok,
        },
      ])
      toast({ title: t('share.people.invited', { email }), tone: 'success' })
    }
    setCandidate(null)
    setLimited(false)
  }

  const remove = async (item: Added) => {
    if (await item.revoke()) {
      setAdded((current) => current.filter((entry) => entry.key !== item.key))
      toast({ title: t('share.people.removed') })
    } else toast({ title: t('app.error.generic'), tone: 'danger' })
  }

  return (
    <section aria-labelledby="share-people" className="grid gap-3">
      <h3 id="share-people" className="text-lg font-heading tracking-heading">
        {t('share.people.title')}
      </h3>
      {candidate === null ? (
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
              onValueChange={(value) => setLevel(value as AccessLevel)}
              options={LEVELS.map((id) => ({ value: id, label: t(`share.level.${id}` as I18nKey), disabled: id === 'edit' && editReason !== null }))}
            />
          </Field>
          {guest ? null : (
            <SwitchRow label={t('share.people.expiry')} description={limited ? undefined : t('share.people.expiryOptional')} checked={limited} onCheckedChange={setLimited} />
          )}
          {needsDate ? (
            <Field label={t('share.people.expiry')} {...(guest ? { hint: t('share.people.expiryRequired') } : {})}>
              <Input type="date" value={ends} min={toDateInput(nowSeconds() + DAY)} onChange={(event) => setEnds(event.target.value)} />
            </Field>
          ) : null}
          <Button variant="primary" loading={busy} onClick={() => void submit()} className="justify-self-end">
            {t('share.people.add')}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {added.length > 0 ? (
        <div className="grid gap-1">
          <h4 className="text-md font-medium">{t('share.people.added')}</h4>
          <ul className="divide-y divide-line">
            {added.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2.5">
                <Avatar name={item.name} size="sm" decorative />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-md">
                    <span className="truncate">{item.name}</span>
                    {item.guest ? <Badge tone="guest">{t('share.people.guest')}</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-text-3">{item.detail}</p>
                </div>
                <IconButton label={t('share.people.remove', { name: item.name })} size="sm" onClick={() => void remove(item)}>
                  <X aria-hidden className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-3">{t('share.people.empty')}</p>
      )}
      <p className="text-sm text-text-3">{t('share.people.addedNote')}</p>
    </section>
  )
}

/** ---- Link -------------------------------------------------------------------------------------------------- */

type LinkState = { readonly status: 'loading' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly link: ShareLinkSummary | null }

const LinkSection = ({ file, workspaceId }: { file: AnyFileView; workspaceId: string }) => {
  const { t, locale } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const [state, setState] = useState<LinkState>({ status: 'loading' })
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordOn, setPasswordOn] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [ends, setEnds] = useState(() => toDateInput(nowSeconds() + DEFAULT_LINK_DAYS * DAY))
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((link: ShareLinkSummary | null) => {
    setState({ status: 'ready', link })
    setPasswordOn(link?.hasPassword ?? false)
    if (link?.expiresAt) setEnds(toDateInput(link.expiresAt))
  }, [])

  useEffect(() => {
    let cancelled = false
    void call<{ links: ShareLinkSummary[] }>('getShareSettings', { workspaceId, fileId: file.id }).then((result) => {
      if (cancelled) return
      if (result.ok) apply(result.data.links[0] ?? null)
      else setState({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [call, workspaceId, file.id, apply])

  if (state.status === 'loading')
    return (
      <div role="status" aria-busy="true" aria-label={t('share.link.loading')} className="grid gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  if (state.status === 'error') return <InlineAlert title={t('share.link.loadError')}>{t('files.error.lead')}</InlineAlert>

  const link = state.link
  const fail = (failure: Parameters<typeof failureKey>[0]) => setError(t(failureKey(failure)))

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    const result = await call<{ link: ShareLinkSummary; url: string }>('createShareLink', { workspaceId, fileId: file.id, level: 'view', expiresAt: nowSeconds() + DEFAULT_LINK_DAYS * DAY })
    setBusy(false)
    if (!result.ok) return fail(result)
    setUrl(result.data.url)
    apply(result.data.link)
  }

  const turnOff = async () => {
    setBusy(true)
    setError(null)
    const result = await call('revokeShareLink', { workspaceId, fileId: file.id })
    setBusy(false)
    if (!result.ok) return fail(result)
    setUrl(null)
    setPassword('')
    apply(null)
  }

  const update = async (change: { level?: LinkLevel; expiresAt?: number | null; password?: string | null }) => {
    setBusy(true)
    setError(null)
    const result = await call<{ links: ShareLinkSummary[] }>('updateShareLink', { workspaceId, fileId: file.id, ...change })
    setBusy(false)
    if (!result.ok) return fail(result)
    apply(result.data.links[0] ?? null)
    return true
  }

  const copy = async () => {
    setError(null)
    const result = await call<{ url: string }>('copyShareLink', { workspaceId, fileId: file.id })
    if (!result.ok) return fail(result)
    setUrl(result.data.url)
    try {
      await navigator.clipboard.writeText(result.data.url)
      toast({ title: t('share.link.copied'), tone: 'success' })
    } catch {
      setError(t('share.link.copyFailed'))
    }
  }

  const savePassword = async () => {
    if (password.length < 8) return setPasswordError(t('share.link.passwordTooShort'))
    if (password.length > 128) return setPasswordError(t('share.link.passwordTooLong'))
    setPasswordError(null)
    if (await update({ password })) setPassword('')
  }

  const locked = link?.legacy === true
  const levelHint = link?.level === 'download' ? t('share.link.levelDownloadHint') : t('share.link.levelViewHint')
  return (
    <section aria-labelledby="share-link" className="grid gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Link2 className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="share-link" className="text-lg font-heading tracking-heading">
            {t('share.link.title')}
          </h3>
          <p className="text-sm text-text-3">{t('share.link.lead')}</p>
        </div>
      </div>
      <SwitchRow
        label={t('share.link.switch')}
        description={link ? t(link.expiresAt === null ? 'share.link.summaryOpen' : 'share.link.summary', { level: t(link.level === 'download' ? 'share.link.levelDownload' : 'share.link.levelView'), date: link.expiresAt === null ? '' : formatDay(link.expiresAt, locale) }) : t('share.link.off')}
        checked={link !== null}
        disabled={busy}
        onCheckedChange={(on) => void (on ? turnOn() : turnOff())}
      />
      {link ? (
        <div className="grid gap-4">
          {link.expired ? <Notice tone="warn">{t('share.link.expired')}</Notice> : null}
          {locked ? <Notice tone="warn">{t('share.link.legacy')}</Notice> : null}
          <Field label={t('share.link.level')} hint={levelHint}>
            <SegmentedControl
              fullWidth
              aria-label={t('share.link.level')}
              value={link.level}
              disabled={locked || busy}
              onValueChange={(value) => void update({ level: value === 'download' ? 'download' : 'view' })}
              options={[
                { value: 'view', label: t('share.link.levelView') },
                { value: 'download', label: t('share.link.levelDownload') },
              ]}
            />
          </Field>
          <div className="grid gap-2">
            <Field label={t('share.link.expiry')}>
              <div className="flex flex-wrap gap-2">
                <Input type="date" value={ends} min={toDateInput(nowSeconds() + DAY)} disabled={locked || busy} onChange={(event) => setEnds(event.target.value)} className="w-auto flex-1" />
                <Button
                  disabled={locked || busy}
                  onClick={() => {
                    const expiresAt = fromDateInput(ends)
                    if (expiresAt === null || expiresAt <= nowSeconds()) return setError(t('share.people.pastDate'))
                    void update({ expiresAt })
                  }}
                >
                  {t('share.link.save')}
                </Button>
                {link.expiresAt !== null ? (
                  <Button disabled={locked || busy} onClick={() => void update({ expiresAt: null })}>
                    {t('share.link.noExpiry')}
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
          <div className="grid gap-2">
            <SwitchRow
              label={t('share.link.password')}
              description={link.hasPassword ? t('share.link.passwordSet') : undefined}
              checked={passwordOn}
              disabled={locked || busy}
              onCheckedChange={(on) => {
                setPasswordOn(on)
                if (!on && link.hasPassword) void update({ password: null })
              }}
            />
            {passwordOn ? (
              <Field label={t('share.link.passwordLabel')} hint={t('share.link.passwordHint')} {...(passwordError ? { error: passwordError } : {})}>
                <div className="flex flex-wrap gap-2">
                  <Input type="password" autoComplete="new-password" value={password} disabled={locked || busy} onChange={(event) => setPassword(event.target.value)} className="w-auto flex-1" />
                  <Button disabled={locked || busy} onClick={() => void savePassword()}>
                    {t('share.link.passwordSave')}
                  </Button>
                </div>
              </Field>
            ) : null}
          </div>
          <div className="grid gap-2">
            {url ? <Input readOnly aria-label={t('share.link.url')} value={url} onFocus={(event) => event.currentTarget.select()} /> : null}
            <Button
              variant="primary"
              onClick={() => void copy()}
              className="justify-self-start"
              {...(link.expired ? { disabledReason: t('share.link.copyExpired') } : {})}
            >
              {url ? <Check aria-hidden className="size-4.5" /> : <Copy aria-hidden className="size-4.5" />}
              {t('share.link.copy')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/** The share window (docs/03 §2.3): people (members or e-mailed guests, with an end date for guests) and the file's one link. */
export const ShareDialog = ({ file, workspaceId, onClose }: { file: AnyFileView; workspaceId: string; onClose: () => void }) => {
  const { t } = useI18n()
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t('share.title')} description={file.name} className="app:max-w-140">
        <PeopleSection file={file} workspaceId={workspaceId} />
        <hr className="border-line" />
        <LinkSection file={file} workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  )
}
