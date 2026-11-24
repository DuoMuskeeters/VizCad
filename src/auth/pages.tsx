import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CircleCheck } from 'lucide-react'
import { rememberNext, takeNext } from '#/app/nav'
import { Button } from '#/components/ui/Button'
import { useI18n } from '#/i18n'
import { readPendingEmail } from './api'
import { AuthHeading, AuthLayout } from './AuthLayout'
import { CheckEmail, ExpiredResetLink, ForgotPasswordForm, InvalidLinkNotice, ResetPasswordForm, SignInForm, SignUpForm } from './forms'

export const noindexHead = (title: string) => () => ({
  meta: [{ title: `${title} · VizCad` }, { name: 'robots', content: 'noindex, nofollow' }],
})

export const SignInPage = ({ next }: { next?: string | undefined }) => {
  const navigate = useNavigate()
  // Return to the invitation (or other page) that sent the visitor here; a stored path covers a verification in another tab.
  const done = () => void navigate({ href: takeNext() ?? next ?? '/app' })
  return (
    <AuthLayout>
      <SignInForm next={next} onSuccess={done} />
    </AuthLayout>
  )
}

export const SignUpPage = ({ next }: { next?: string | undefined }) => {
  const navigate = useNavigate()
  return (
    <AuthLayout>
      <SignUpForm
        next={next}
        onSuccess={() => {
          if (next) rememberNext(next)
          void navigate({ to: '/verify-email', search: { error: undefined } })
        }}
      />
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
