import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleAlert, MailCheck, TriangleAlert, Users } from 'lucide-react'
import { postAuth } from '#/auth/api'
import { Avatar } from '#/components/ui/Avatar'
import { Button } from '#/components/ui/Button'
import { Logo } from '#/components/ui/Logo'
import { Notice } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { useI18n, type I18nKey } from '#/i18n'
import { type AppFailure, type InvitationDetails } from '../api'
import { failureKey } from '../errors'
import { roleHintKey, roleKey } from '../roles'
import { SessionProvider, useSession } from '../session'

export type InviteKind = { readonly kind: 'member'; readonly id: string } | { readonly kind: 'guest'; readonly token: string }

const pathOf = (invite: InviteKind) => (invite.kind === 'member' ? `/invite/${invite.id}` : `/guest-invite/${invite.token}`)

type Problem = { readonly title: I18nKey; readonly lead: I18nKey; readonly tone: 'warn' | 'error'; readonly otherAccount?: boolean }

/** Failed acceptances, each with its own explanation and next step (docs/03 §2.11, mockup 08). */
export const problemFor = (failure: Pick<AppFailure, 'error' | 'reason'>): Problem => {
  switch (failure.error) {
    case 'InvitationExpired':
      return { title: 'app.invite.expired.title', lead: 'app.invite.expired.lead', tone: 'warn' }
    case 'InvitationUnavailable':
      return { title: 'app.invite.unavailable.title', lead: 'app.invite.unavailable.lead', tone: 'error', otherAccount: true }
    case 'InvitationConflict':
      return { title: 'app.invite.conflict.title', lead: 'app.invite.conflict.lead', tone: 'warn' }
    case 'SeatLimitReached':
    case 'GuestLimitReached':
      return { title: 'app.invite.full.title', lead: failureKey(failure), tone: 'warn' }
    case 'EmailUnverified':
      return { title: 'app.invite.unverified.title', lead: 'app.error.emailUnverified', tone: 'warn' }
    default:
      return { title: 'app.invite.failed.title', lead: failureKey(failure), tone: 'error' }
  }
}

const Card = ({ children }: { children: ReactNode }) => (
  <div className="min-h-dvh bg-bg">
    <header className="flex h-16 items-center px-4 app:px-10">
      <Logo alt="VizCad" className="text-[26px]" />
    </header>
    <main className="mx-auto w-full max-w-120 px-4 pb-16 pt-6 app:pt-14">
      <div className="grid min-w-0 gap-6 rounded-xl border border-line bg-bg p-5 app:p-8 [&>*]:min-w-0">{children}</div>
    </main>
  </div>
)

const Heading = ({ icon, title, lead }: { icon: ReactNode; title: string; lead: string }) => (
  <div className="grid gap-3">
    <span aria-hidden className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-6">
      {icon}
    </span>
    <h1 className="text-2xl font-heading tracking-heading [overflow-wrap:anywhere]">{title}</h1>
    <p className="text-text-2">{lead}</p>
  </div>
)

type Loaded = { readonly status: 'loading' } | { readonly status: 'none' } | { readonly status: 'ready'; readonly details: InvitationDetails }

const levelKey = (level: string): I18nKey =>
  level === 'view' ? 'app.invite.level.view' : level === 'download' ? 'app.invite.level.download' : 'app.invite.level.comment'
const levelHintKey = (level: string): I18nKey =>
  level === 'view' ? 'app.invite.level.viewHint' : level === 'download' ? 'app.invite.level.downloadHint' : 'app.invite.level.commentHint'

const Fact = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="grid gap-0.5 py-3">
    <dt className="text-sm text-text-3">{label}</dt>
    <dd className="font-medium">{value}</dd>
    {hint ? <dd className="text-sm text-text-2">{hint}</dd> : null}
  </div>
)

/** The invitation card before accepting (mockup 08): who invited, to what, with which rights, for how long. */
const DetailsCard = ({ details }: { details: Extract<InvitationDetails, { kind: 'member' | 'guest' }> }) => {
  const { t, locale } = useI18n()
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const days = Math.max(1, Math.ceil((details.expiresAt * 1000 - Date.now()) / 86_400_000))
  const guest = details.kind === 'guest'
  const who = details.inviterEmail
  const roleName = t(roleKey(details.role ?? 'member'))
  const title = guest
    ? who ? t('app.invite.card.guest', { inviter: who, workspace: details.workspaceName }) : t('app.invite.card.guestNoInviter', { workspace: details.workspaceName })
    : who ? t('app.invite.card.member', { inviter: who, workspace: details.workspaceName, role: roleName }) : t('app.invite.card.memberNoInviter', { workspace: details.workspaceName, role: roleName })
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={details.workspaceName} decorative />
        <span className="min-w-0 truncate font-medium">{details.workspaceName}</span>
      </div>
      <h1 className="text-2xl font-heading tracking-heading [overflow-wrap:anywhere]">{title}</h1>
      <dl className="divide-y divide-line rounded-lg border border-line px-4">
        {guest ? (
          <>
            <Fact label={t('app.invite.card.level')} value={t(levelKey(details.level ?? 'comment'))} hint={t(levelHintKey(details.level ?? 'comment'))} />
            <Fact label={t('app.invite.card.scope')} value={t(details.target === 'file' ? 'app.invite.card.file' : 'app.invite.card.project')} />
            {details.accessExpiresAt !== null ? <Fact label={t('app.invite.card.until')} value={date.format(new Date(details.accessExpiresAt * 1000))} /> : null}
          </>
        ) : (
          <Fact label={t('app.invite.card.role')} value={roleName} hint={t(roleHintKey(details.role ?? 'member'))} />
        )}
      </dl>
      <p className="text-sm text-text-3">
        {guest ? `${t('app.invite.card.noSeat')} ` : ''}
        {t('app.invite.card.validFor', { days })}
      </p>
    </>
  )
}

const Body = ({ invite }: { invite: InviteKind }) => {
  const { t } = useI18n()
  const { state, call } = useSession()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [switching, setSwitching] = useState(false)
  const next = pathOf(invite)
  const guest = invite.kind === 'guest'
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const signedIn = state.status === 'ready'
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void call<InvitationDetails>('getInvitation', invite.kind === 'member' ? { invitationId: invite.id } : { token: invite.token }).then((result) => {
      if (cancelled) return
      if (result.ok) return setLoaded({ status: 'ready', details: result.data })
      if (result.error === 'Unauthenticated') return window.location.reload()
      // The card is a courtesy: when it cannot load, accepting still works and reports its own problems.
      if (result.error === 'EmailUnverified') setProblem(problemFor(result))
      setLoaded({ status: 'none' })
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, call, invite])

  if (state.status === 'loading')
    return (
      <Card>
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="size-13 rounded-full" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>
    )

  if (state.status === 'error')
    return (
      <Card>
        <Heading icon={<CircleAlert />} title={t('app.error.loadTitle')} lead={t('app.error.network')} />
        <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </Card>
    )

  if (state.status === 'anonymous')
    return (
      <Card>
        <Heading
          icon={guest ? <MailCheck /> : <Users />}
          title={t(guest ? 'app.invite.guest.title' : 'app.invite.member.title')}
          lead={t('app.invite.anonymous.lead')}
        />
        <div className="grid gap-2">
          <Button asChild variant="primary" className="h-12 text-base">
            <Link to="/sign-up" search={{ next }}>
              {t('app.invite.createAccount')}
            </Link>
          </Button>
          <Button asChild className="h-12 text-base">
            <Link to="/sign-in" search={{ next }}>
              {t('app.invite.signIn')}
            </Link>
          </Button>
        </div>
        <p className="text-sm text-text-3">{t('app.invite.sameEmail')}</p>
      </Card>
    )

  const accept = async () => {
    setBusy(true)
    const result =
      invite.kind === 'member'
        ? await call<{ workspaceId: string }>('acceptInvitation', { invitationId: invite.id })
        : await call<{ workspaceId: string }>('acceptGuestInvitation', { token: invite.token })
    if (!result.ok) {
      setBusy(false)
      if (result.error === 'Unauthenticated') return window.location.reload()
      return setProblem(problemFor(result))
    }
    // Land in the workspace that just opened; a failed switch still leaves the person in the app.
    await call('switchWorkspace', { workspaceId: result.data.workspaceId })
    // Someone who joins by invitation has no use for the sign-up onboarding.
    await call('completeOnboarding')
    toast({ title: t('app.invite.joined'), tone: 'success' })
    void navigate({ to: '/app' })
  }

  const otherAccount = async () => {
    setSwitching(true)
    await postAuth('/sign-out', {})
    void navigate({ to: '/sign-in', search: { next } })
  }

  if (problem)
    return (
      <Card>
        <Heading icon={problem.tone === 'warn' ? <TriangleAlert /> : <CircleAlert />} title={t(problem.title)} lead={t(problem.lead)} />
        <Notice>{t('app.invite.signedInAs', { email: state.user.email })}</Notice>
        <div className="grid gap-2">
          {problem.otherAccount ? (
            <Button variant="primary" loading={switching} onClick={() => void otherAccount()} className="h-12 text-base">
              {t('app.invite.otherAccount')}
            </Button>
          ) : null}
          <Button asChild className="h-12 text-base">
            <Link to="/app">{t('app.invite.goToApp')}</Link>
          </Button>
        </div>
      </Card>
    )

  if (loaded.status === 'loading')
    return (
      <Card>
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="size-13 rounded-full" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>
    )

  const details = loaded.status === 'ready' ? loaded.details : null
  if (details?.state === 'other_account')
    return (
      <Card>
        <Heading icon={<CircleAlert />} title={t('app.invite.otherSent.title')} lead={t('app.invite.otherSent.lead')} />
        <Notice>{t('app.invite.signedInAs', { email: state.user.email })}</Notice>
        <div className="grid gap-2">
          <Button variant="primary" loading={switching} onClick={() => void otherAccount()} className="h-12 text-base">
            {t('app.invite.otherAccount')}
          </Button>
          <Button asChild className="h-12 text-base">
            <Link to="/app">{t('app.invite.goToApp')}</Link>
          </Button>
        </div>
      </Card>
    )
  if (details && details.state !== 'pending')
    return (
      <Card>
        <Heading
          icon={<TriangleAlert />}
          title={t(details.state === 'expired' ? 'app.invite.expired.title' : details.state === 'accepted' ? 'app.invite.accepted.title' : 'app.invite.canceled.title')}
          lead={t(details.state === 'expired' ? 'app.invite.expired.lead' : details.state === 'accepted' ? 'app.invite.accepted.lead' : 'app.invite.canceled.lead')}
        />
        <Button asChild variant="primary" className="h-12 text-base">
          <Link to="/app">{t('app.invite.goToApp')}</Link>
        </Button>
      </Card>
    )

  const wrongAccount = details !== null && !details.emailMatches
  return (
    <Card>
      {details ? (
        <DetailsCard details={details} />
      ) : (
        <Heading
          icon={guest ? <MailCheck /> : <Users />}
          title={t(guest ? 'app.invite.guest.title' : 'app.invite.member.title')}
          lead={t(guest ? 'app.invite.guest.lead' : 'app.invite.member.lead')}
        />
      )}
      <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3">
        <Avatar name={state.user.name} decorative />
        <div className="min-w-0 text-sm leading-snug">
          <div className="truncate font-medium">{state.user.name}</div>
          <div className="truncate text-text-3">{state.user.email}</div>
        </div>
      </div>
      {wrongAccount ? <Notice tone="warn">{t('app.invite.wrongAccount')}</Notice> : null}
      <div className="grid gap-2">
        {wrongAccount ? (
          <Button variant="primary" loading={switching} onClick={() => void otherAccount()} className="h-12 text-base">
            {t('app.invite.otherAccount')}
          </Button>
        ) : (
          <>
            <Button variant="primary" loading={busy} onClick={() => void accept()} className="h-12 text-base">
              {t('app.invite.accept')}
            </Button>
            <button
              type="button"
              onClick={() => void otherAccount()}
              disabled={switching}
              className="min-h-11 rounded-md text-base font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
            >
              {t('app.invite.otherAccount')}
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

export const InvitePage = ({ invite }: { invite: InviteKind }) => (
  <SessionProvider>
    <Body invite={invite} />
  </SessionProvider>
)
