import { useState, type ReactNode } from 'react'
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
import { type AppFailure } from '../api'
import { failureKey } from '../errors'
import { clearOnboardingPending } from '../nav'
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
      <div className="grid gap-6 rounded-xl border border-line bg-bg p-5 app:p-8">{children}</div>
    </main>
  </div>
)

const Heading = ({ icon, title, lead }: { icon: ReactNode; title: string; lead: string }) => (
  <div className="grid gap-3">
    <span aria-hidden className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-6">
      {icon}
    </span>
    <h1 className="text-2xl font-heading tracking-heading">{title}</h1>
    <p className="text-text-2">{lead}</p>
  </div>
)

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
    clearOnboardingPending()
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

  return (
    <Card>
      <Heading
        icon={guest ? <MailCheck /> : <Users />}
        title={t(guest ? 'app.invite.guest.title' : 'app.invite.member.title')}
        lead={t(guest ? 'app.invite.guest.lead' : 'app.invite.member.lead')}
      />
      <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3">
        <Avatar name={state.user.name} decorative />
        <div className="min-w-0 text-sm leading-snug">
          <div className="truncate font-medium">{state.user.name}</div>
          <div className="truncate text-text-3">{state.user.email}</div>
        </div>
      </div>
      <div className="grid gap-2">
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
      </div>
    </Card>
  )
}

export const InvitePage = ({ invite }: { invite: InviteKind }) => (
  <SessionProvider>
    <Body invite={invite} />
  </SessionProvider>
)
