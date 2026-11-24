import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CircleCheck, Info } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { useI18n } from '#/i18n'
import { postAuth, readPendingEmail } from './api'
import { AuthHeading, AuthLayout } from './AuthLayout'
import { CheckEmail, ExpiredResetLink, ForgotPasswordForm, InvalidLinkNotice, ResetPasswordForm, SignInForm, SignUpForm } from './forms'

export const noindexHead = (title: string) => () => ({
  meta: [{ title: `${title} · VizCad` }, { name: 'robots', content: 'noindex, nofollow' }],
})

export const SignInPage = () => {
  const navigate = useNavigate()
  return (
    <AuthLayout>
      <SignInForm onSuccess={() => void navigate({ to: '/app' })} />
    </AuthLayout>
  )
}

export const SignUpPage = () => {
  const navigate = useNavigate()
  return (
    <AuthLayout>
      <SignUpForm onSuccess={() => void navigate({ to: '/verify-email', search: { error: undefined } })} />
    </AuthLayout>
  )
}

export const VerifyEmailPage = ({ error }: { error: string | undefined }) => {
  const { t } = useI18n()
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => setEmail(readPendingEmail()), [])
  return (
    <AuthLayout>
      {error ? (
        <InvalidLinkNotice title={t('auth.verifyEmail.invalidTokenTitle')} lead={t('auth.verifyEmail.invalidTokenLead')}>
          <Button asChild variant="primary" className="h-12 w-full rounded-lg text-base font-semibold">
            <a href="/sign-in">{t('auth.verifyEmail.signInBtn')}</a>
          </Button>
        </InvalidLinkNotice>
      ) : (
        <CheckEmail email={email} />
      )}
    </AuthLayout>
  )
}

export const EmailVerifiedPage = () => {
  const { t } = useI18n()
  return (
    <AuthLayout>
      <div className="grid gap-5">
        <span className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <AuthHeading title={t('auth.verifyEmail.verifiedTitle')} lead={t('auth.verifyEmail.verifiedLead')} />
        <Button asChild variant="primary" className="h-12 w-full rounded-lg text-base font-semibold">
          <a href="/sign-in">{t('auth.verifyEmail.signInBtn')}</a>
        </Button>
      </div>
    </AuthLayout>
  )
}

export const ForgotPasswordPage = () => (
  <AuthLayout>
    <ForgotPasswordForm />
  </AuthLayout>
)

export const ResetPasswordPage = ({ token, error }: { token: string | undefined; error: string | undefined }) => (
  <AuthLayout>{token && !error ? <ResetPasswordForm token={token} /> : <ExpiredResetLink />}</AuthLayout>
)

/** Temporary landing after sign-in until the real app shell exists. */
export const SignedInPlaceholder = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    await postAuth('/sign-out', {})
    void navigate({ to: '/sign-in' })
  }
  return (
    <AuthLayout>
      <div className="grid gap-5">
        <span className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent">
          <Info aria-hidden className="size-6" />
        </span>
        <AuthHeading title={t('app.placeholder.title')} lead={t('app.placeholder.lead')} />
        <Button loading={busy} onClick={() => void signOut()} className="h-12 w-full rounded-lg text-base font-semibold">
          {t('app.placeholder.signOut')}
        </Button>
      </div>
    </AuthLayout>
  )
}
