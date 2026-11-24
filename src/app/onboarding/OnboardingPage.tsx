import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Building2, User } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { ChipsInput } from '#/components/ui/ChipsInput'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { Logo } from '#/components/ui/Logo'
import { RadioCard, RadioCardGroup } from '#/components/ui/RadioCard'
import { useToast } from '#/components/ui/Toast'
import { Avatar } from '#/components/ui/Avatar'
import { useI18n } from '#/i18n'
import type { WorkspaceSummary } from '../api'
import { failureKey } from '../errors'
import { RequireSession, SessionProvider, useSession, useUser } from '../session'
import { assignableRoles, roleHintKey, roleKey, type InternalRole } from '../roles'
import { validateCompanyName } from '../validation'
import { useWorkspaceState, WorkspaceProvider } from '../workspace'

type Step = 'kind' | 'company' | 'team'
type Kind = 'personal' | 'company'

const Steps = ({ step, total, kind }: { step: number; total: number; kind: Kind }) => {
  const { t } = useI18n()
  return (
    <div className="mb-8 grid gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < step ? 'h-1 flex-1 rounded-full bg-brand' : 'h-1 flex-1 rounded-full bg-line'} />
        ))}
      </div>
      <p className="text-sm text-text-3">{kind === 'personal' ? t('app.onboarding.stepOnly') : t('app.onboarding.step', { step, total })}</p>
    </div>
  )
}

const Flow = () => {
  const { t, locale } = useI18n()
  const user = useUser()
  const { call } = useSession()
  const { state, adopt, completeOnboarding } = useWorkspaceState()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('kind')
  const [kind, setKind] = useState<Kind>('company')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [created, setCreated] = useState<WorkspaceSummary | null>(null)
  const [emails, setEmails] = useState<string[]>([])
  const [role, setRole] = useState<InternalRole>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // D20: only new sign-ups see this; anyone else is sent to the app.
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    if (state.status === 'ready' && allowed === null) setAllowed(state.needsOnboarding)
    if (state.status === 'ready' && state.needsOnboarding === false && allowed === false) void navigate({ to: '/app' })
  }, [state, allowed, navigate])

  const finish = async (to: '/app' | '/app/team' = '/app') => {
    setBusy(true)
    const result = await completeOnboarding()
    setBusy(false)
    if (!result.ok) return setError(t(failureKey(result)))
    void navigate({ to })
  }

  const chooseKind = (event: FormEvent) => {
    event.preventDefault()
    if (kind === 'personal') return void finish()
    setStep('company')
  }

  const createCompany = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = validateCompanyName(name)
    if (invalid) return setNameError(t(invalid))
    setNameError(null)
    setBusy(true)
    setError(null)
    // A retry after a failed switch must not create a second workspace.
    const result = created ? { ok: true as const, data: created } : await call<WorkspaceSummary>('createWorkspace', { name: name.trim() })
    if (!result.ok) {
      setBusy(false)
      return setError(t(failureKey(result)))
    }
    setCreated(result.data)
    const switched = await adopt(result.data)
    setBusy(false)
    if (!switched.ok) return setError(t(failureKey(switched)))
    setStep('team')
  }

  const sendInvites = async (event: FormEvent) => {
    event.preventDefault()
    if (!created) return
    if (emails.length === 0) return void finish()
    setBusy(true)
    setError(null)
    const left: string[] = []
    let sent = 0
    let firstError: string | null = null
    for (const email of emails) {
      const result = await call('inviteMember', { workspaceId: created.id, email, role, locale })
      if (result.ok) sent += 1
      else {
        left.push(email)
        firstError ??= t(failureKey(result))
      }
    }
    setBusy(false)
    if (sent > 0) toast({ title: t('app.team.invite.sent', { count: sent }), tone: 'success' })
    if (left.length === 0) return void finish('/app/team')
    setEmails(left)
    setError(firstError)
  }

  if (!allowed || state.status === 'loading') return null

  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex h-16 items-center justify-between px-4 app:px-10">
        <Logo alt="VizCad" className="text-[26px]" />
        <span className="flex min-w-0 items-center gap-2 text-sm text-text-2">
          <Avatar name={user.name} decorative size="sm" />
          <span className="truncate">{user.email}</span>
        </span>
      </header>
      <main className="mx-auto w-full max-w-130 px-4 pb-16 pt-6 app:pt-14">
        <Steps step={step === 'kind' ? 1 : step === 'company' ? 2 : 3} total={3} kind={step === 'kind' ? kind : 'company'} />

        {step === 'kind' ? (
          <form onSubmit={chooseKind} className="grid gap-6">
            <div>
              <h1 className="text-2xl font-heading tracking-heading">{t('app.onboarding.kind.title')}</h1>
              <p className="mt-1.5 text-text-2">{t('app.onboarding.kind.lead', { name: user.name.split(' ')[0] ?? user.name })}</p>
            </div>
            <RadioCardGroup aria-label={t('app.onboarding.kind.title')} value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <RadioCard value="personal" title={t('app.onboarding.kind.personal')} icon={<User aria-hidden />} description={t('app.onboarding.kind.personalLead')} />
              <RadioCard value="company" title={t('app.onboarding.kind.company')} icon={<Building2 aria-hidden />} description={t('app.onboarding.kind.companyLead')} />
            </RadioCardGroup>
            {error ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <Button variant="primary" type="submit" loading={busy} className="h-12 w-full text-base">
              {t('common.continue')}
            </Button>
          </form>
        ) : null}

        {step === 'company' ? (
          <form onSubmit={(e) => void createCompany(e)} noValidate className="grid gap-6">
            <div>
              <h1 className="text-2xl font-heading tracking-heading">{t('app.onboarding.company.title')}</h1>
              <p className="mt-1.5 text-text-2">{t('app.onboarding.company.lead')}</p>
            </div>
            <Field label={t('app.workspace.nameLabel')} hint={t('app.workspace.nameHint')} error={nameError ?? error}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={80} placeholder={t('app.workspace.namePlaceholder')} className="h-12" />
            </Field>
            <div className="grid gap-2 app:grid-cols-2">
              <Button variant="primary" type="submit" loading={busy} className="h-12 text-base app:order-2">
                {t('common.continue')}
              </Button>
              <Button onClick={() => setStep('kind')} className="h-12 text-base app:order-1" disabled={busy}>
                {t('common.back')}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 'team' && created ? (
          <form onSubmit={(e) => void sendInvites(e)} noValidate className="grid gap-6">
            <div>
              <h1 className="text-2xl font-heading tracking-heading">{t('app.onboarding.team.title')}</h1>
              <p className="mt-1.5 text-text-2">{t('app.onboarding.team.lead', { name: created.name })}</p>
            </div>
            <Field label={t('app.team.invite.emails')} hint={t('app.team.invite.emailsHint')} error={error}>
              <ChipsInput value={emails} onValueChange={setEmails} placeholder={t('app.team.invite.emailPlaceholder')} removeLabel={(item) => t('app.team.invite.remove', { email: item })} />
            </Field>
            <div className="grid gap-1.5">
              <span id="ob-role" className="text-md font-medium app:text-base">
                {t('app.team.invite.role')}
              </span>
              <RadioCardGroup aria-labelledby="ob-role" value={role} onValueChange={(v) => setRole(v as InternalRole)}>
                {assignableRoles('owner').map((r) => (
                  <RadioCard key={r} value={r} title={t(roleKey(r))} description={t(roleHintKey(r))} />
                ))}
              </RadioCardGroup>
            </div>
            <div className="grid gap-2 app:grid-cols-2">
              <Button variant="primary" type="submit" loading={busy} className="h-12 text-base app:order-2">
                {emails.length > 0 ? t('app.team.invite.send') : t('app.onboarding.team.done')}
              </Button>
              <Button onClick={() => void finish()} disabled={busy} className="h-12 text-base app:order-1">
                {t('app.onboarding.team.skip')}
              </Button>
            </div>
          </form>
        ) : null}
      </main>
    </div>
  )
}

export const OnboardingPage = () => (
  <SessionProvider>
    <RequireSession>
      <WorkspaceProvider>
        <Flow />
      </WorkspaceProvider>
    </RequireSession>
  </SessionProvider>
)
