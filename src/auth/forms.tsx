import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CircleAlert, MailCheck, CircleCheck, Info, ChevronLeft } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { Field } from '#/components/ui/Field'
import { Input } from '#/components/ui/Input'
import { TextLink } from '#/components/ui/Link'
import { Notice } from '#/components/ui/Notice'
import { useI18n, type I18nKey } from '#/i18n'
import { postAuth, rememberPendingEmail, TURNSTILE_HEADER, type AuthFailure } from './api'
import { AuthHeading } from './AuthLayout'
import { requestMessage, signInMessage, signUpMessage } from './messages'
import { PasswordField } from './PasswordField'
import { Turnstile, turnstileSiteKey } from './Turnstile'
import { normalizeEmail, validateCurrentPassword, validateEmail, validateName, validateNewPassword } from './validation'

export const VERIFIED_PATH = '/email-verified'
export const RESET_PATH = '/reset-password'

/** Guards a submit handler against double submission (state alone lags a frame behind a fast double click). */
const useSubmitGuard = () => {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const run = async (task: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      await task()
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return { pending, run }
}

const FormError = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="flex items-start gap-1.5 text-md leading-snug text-danger">
    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
    <span>{children}</span>
  </p>
)

const GoogleButton = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) => (
  <Button type="button" onClick={onClick} disabled={disabled} className="h-12 w-full gap-2.5 rounded-lg text-base font-semibold">
    <svg viewBox="0 0 48 48" aria-hidden className="size-5">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
    {label}
  </Button>
)

export const googleEnabled = () => import.meta.env.VITE_GOOGLE_SIGN_IN === 'true'

const OrDivider = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 text-sm text-text-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{children}</div>
)

const startGoogle = async (callbackURL: string): Promise<AuthFailure | null> => {
  const result = await postAuth('/sign-in/social', { provider: 'google', callbackURL, disableRedirect: true })
  if (!result.ok) return result.failure
  const url = (result.data as { url?: unknown } | undefined)?.url
  if (typeof url !== 'string') return 'generic'
  window.location.assign(url)
  return null
}

export type FormDeps = { onSuccess: () => void; fetcher?: typeof fetch; /** Same-site path to return to; carried across the sign-in / sign-up link. */ next?: string | undefined }
const withNext = (href: string, next: string | undefined) => (next ? `${href}?next=${encodeURIComponent(next)}` : href)

// ---------------------------------------------------------------- sign in

export const SignInForm = ({ onSuccess, fetcher, next, google = googleEnabled() }: FormDeps & { google?: boolean }) => {
  const { t } = useI18n()
  const { pending, run } = useSubmitGuard()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: I18nKey; password?: I18nKey }>({})
  const [formError, setFormError] = useState<I18nKey | null>(null)
  const [unverified, setUnverified] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = {
      ...(validateEmail(email) ? { email: validateEmail(email)! } : {}),
      ...(validateCurrentPassword(password) ? { password: validateCurrentPassword(password)! } : {}),
    }
    setErrors(next)
    setFormError(null)
    setUnverified(false)
    if (next.email || next.password) return
    void run(async () => {
      const result = await postAuth('/sign-in/email', { email: normalizeEmail(email), password }, { fetcher })
      if (result.ok) return onSuccess()
      setFormError(signInMessage(result.failure))
      if (result.failure === 'email-not-verified') {
        rememberPendingEmail(normalizeEmail(email))
        setUnverified(true)
      }
    })
  }

  const google_ = () =>
    void run(async () => {
      const failure = await startGoogle('/app')
      if (failure) setFormError(signInMessage(failure))
    })

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <AuthHeading
        title={t('auth.signIn.title')}
        lead={
          <>
            {t('auth.signIn.lead')} <TextLink href={withNext('/sign-up', next)}>{t('auth.signIn.signUpLink')}</TextLink>
          </>
        }
      />
      {google ? (
        <>
          <GoogleButton label={t('auth.signIn.googleBtn')} onClick={google_} disabled={pending} />
          <OrDivider>{t('auth.signIn.orEmail')}</OrDivider>
        </>
      ) : null}
      <div className="grid gap-3.5">
        <Field label={t('auth.signIn.emailLabel')} error={errors.email && t(errors.email)} required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder={t('auth.signIn.emailPlaceholder')}
            className="h-12"
          />
        </Field>
        <PasswordField
          label={t('auth.signIn.passwordLabel')}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password && t(errors.password)}
          labelAside={
            <TextLink href="/forgot-password" className="-my-3 py-3 text-md">
              {t('auth.signIn.forgotPassword')}
            </TextLink>
          }
        />
      </div>
      {formError ? (
        <FormError>
          {t(formError)}
          {unverified ? (
            <>
              {' '}
              <TextLink href="/verify-email" className="text-danger decoration-danger/50">
                {t('auth.verifyEmail.resendBtn')}
              </TextLink>
            </>
          ) : null}
        </FormError>
      ) : null}
      <Button type="submit" variant="primary" loading={pending} className="h-12 w-full rounded-lg text-base font-semibold">
        {pending ? t('auth.signIn.submitting') : t('auth.signIn.submitBtn')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------- sign up

export const SignUpForm = ({ onSuccess, fetcher, next, google = googleEnabled() }: FormDeps & { google?: boolean }) => {
  const { t } = useI18n()
  const { pending, run } = useSubmitGuard()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState(0)
  const [errors, setErrors] = useState<{ name?: I18nKey; email?: I18nKey; password?: I18nKey }>({})
  const [formError, setFormError] = useState<I18nKey | null>(null)
  const [existing, setExisting] = useState(false)
  const widgetAvailable = turnstileSiteKey() !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = {
      ...(validateName(name) ? { name: validateName(name)! } : {}),
      ...(validateEmail(email) ? { email: validateEmail(email)! } : {}),
      ...(validateNewPassword(password) ? { password: validateNewPassword(password)! } : {}),
    }
    setErrors(next)
    setFormError(null)
    setExisting(false)
    if (next.name || next.email || next.password) return
    if (!token) return setFormError('auth.signUp.captchaRequired')
    void run(async () => {
      const result = await postAuth(
        '/sign-up/email',
        { name: name.trim(), email: normalizeEmail(email), password, callbackURL: VERIFIED_PATH },
        { headers: { [TURNSTILE_HEADER]: token }, fetcher },
      )
      if (result.ok) {
        rememberPendingEmail(normalizeEmail(email))
        return onSuccess()
      }
      // A Turnstile token is single use: get a fresh one for the next attempt.
      setToken(null)
      setWidgetKey((k) => k + 1)
      setFormError(signUpMessage(result.failure))
      setExisting(result.failure === 'email-exists')
    })
  }

  const google_ = () =>
    void run(async () => {
      const failure = await startGoogle('/app')
      if (failure) setFormError(signUpMessage(failure))
    })

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <AuthHeading
        title={t('auth.signUp.title')}
        lead={
          <>
            {t('auth.signUp.lead')} <TextLink href={withNext('/sign-in', next)}>{t('auth.signUp.signInLink')}</TextLink>
          </>
        }
      />
      {google ? (
        <>
          <GoogleButton label={t('auth.signUp.googleBtn')} onClick={google_} disabled={pending} />
          <OrDivider>{t('auth.signUp.orEmail')}</OrDivider>
        </>
      ) : null}
      <div className="grid gap-3.5">
        <Field label={t('auth.signUp.nameLabel')} error={errors.name && t(errors.name)} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder={t('auth.signUp.namePlaceholder')}
            className="h-12"
          />
        </Field>
        <Field label={t('auth.signUp.emailLabel')} error={errors.email && t(errors.email)} required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder={t('auth.signUp.emailPlaceholder')}
            className="h-12"
          />
        </Field>
        <PasswordField
          label={t('auth.signUp.passwordLabel')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={errors.password && t(errors.password)}
          hint={t('auth.signUp.passwordHint')}
        />
      </div>
      {widgetAvailable ? (
        <Turnstile key={widgetKey} action="signup" onToken={setToken} onError={() => setFormError('auth.signUp.captchaFailed')} />
      ) : null}
      {formError ? (
        <FormError>
          {t(formError)}
          {existing ? (
            <>
              {' '}
              <TextLink href="/sign-in" className="text-danger decoration-danger/50">
                {t('auth.signUp.emailExistsAction')}
              </TextLink>
            </>
          ) : null}
        </FormError>
      ) : null}
      <Button type="submit" variant="primary" loading={pending} className="h-12 w-full rounded-lg text-base font-semibold">
        {pending ? t('auth.signUp.submitting') : t('auth.signUp.submitBtn')}
      </Button>
      <p className="text-sm leading-normal text-text-3">
        {t('auth.signUp.termsAgreement')}{' '}
        <TextLink href="/legal/terms" className="font-regular text-text-2">
          {t('auth.signUp.termsLink')}
        </TextLink>{' '}
        {t('auth.signUp.and')}{' '}
        <TextLink href="/legal/privacy" className="font-regular text-text-2">
          {t('auth.signUp.privacyLink')}
        </TextLink>
        {t('auth.signUp.termsSuffix')}
      </p>
    </form>
  )
}

// ---------------------------------------------------------------- forgot password

export const ForgotPasswordForm = ({ fetcher }: { fetcher?: typeof fetch }) => {
  const { t } = useI18n()
  const { pending, run } = useSubmitGuard()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<I18nKey | null>(null)
  const [formError, setFormError] = useState<I18nKey | null>(null)
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const invalid = email.trim() === '' ? 'auth.forgotPassword.emailRequired' : validateEmail(email)
    setError(invalid)
    if (invalid) return
    void run(async () => {
      const result = await postAuth('/request-password-reset', { email: normalizeEmail(email), redirectTo: RESET_PATH }, { fetcher })
      // Same answer whether or not the account exists; only limits and connectivity are shown as errors.
      const problem = result.ok ? null : requestMessage(result.failure, 'auth.signIn.rateLimitError')
      if (problem) return setFormError(problem)
      setSent(true)
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <a
        href="/sign-in"
        className="-mb-3 -mt-2 -ml-1.5 inline-flex h-11 w-max items-center gap-1 rounded-md pl-1 pr-2 text-md font-medium text-text-2 hover:bg-hover"
      >
        <ChevronLeft aria-hidden className="size-4.5" />
        {t('auth.forgotPassword.backToSignIn')}
      </a>
      <AuthHeading title={t('auth.forgotPassword.title')} lead={t('auth.forgotPassword.lead')} />
      <Field label={t('auth.forgotPassword.emailLabel')} error={error && t(error)} required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder={t('auth.forgotPassword.emailPlaceholder')}
          className="h-12"
        />
      </Field>
      {sent ? <Notice tone="success">{t('auth.forgotPassword.successMessage')}</Notice> : null}
      {formError ? <FormError>{t(formError)}</FormError> : null}
      <Button type="submit" variant="primary" loading={pending} className="h-12 w-full rounded-lg text-base font-semibold">
        {pending ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submitBtn')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------- reset password

const Ring = ({ children }: { children: ReactNode }) => (
  <span className="grid size-13 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-6">{children}</span>
)

export const InvalidLinkNotice = ({ title, lead, children }: { title: string; lead: string; children: ReactNode }) => (
  <div className="grid gap-5">
    <Ring>
      <Info aria-hidden />
    </Ring>
    <AuthHeading title={title} lead={lead} />
    {children}
  </div>
)

export const ResetPasswordForm = ({ token, fetcher }: { token: string; fetcher?: typeof fetch }) => {
  const { t } = useI18n()
  const { pending, run } = useSubmitGuard()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<I18nKey | null>(null)
  const [formError, setFormError] = useState<I18nKey | null>(null)
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const invalid = validateNewPassword(password)
    setError(invalid)
    if (invalid) return
    void run(async () => {
      const result = await postAuth('/reset-password', { newPassword: password, token }, { fetcher })
      if (result.ok) return setState('done')
      if (result.failure === 'invalid-token') return setState('invalid')
      setFormError(result.failure === 'rate-limit' ? 'auth.signIn.rateLimitError' : result.failure === 'network' ? 'auth.signIn.networkError' : 'common.genericError')
    })
  }

  if (state === 'invalid') return <ExpiredResetLink />
  if (state === 'done')
    return (
      <div className="grid gap-5">
        <Ring>
          <CircleCheck aria-hidden />
        </Ring>
        <AuthHeading title={t('auth.resetPassword.successTitle')} lead={t('auth.resetPassword.successLead')} />
        <Button asChild variant="primary" className="h-12 w-full rounded-lg text-base font-semibold">
          <a href="/sign-in">{t('auth.resetPassword.signInBtn')}</a>
        </Button>
      </div>
    )

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <AuthHeading title={t('auth.resetPassword.title')} lead={t('auth.resetPassword.lead')} />
      <PasswordField
        label={t('auth.resetPassword.newPasswordLabel')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={error ? t(error) : undefined}
        hint={t('auth.resetPassword.passwordHint')}
      />
      {formError ? <FormError>{t(formError)}</FormError> : null}
      <Button type="submit" variant="primary" loading={pending} className="h-12 w-full rounded-lg text-base font-semibold">
        {pending ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submitBtn')}
      </Button>
    </form>
  )
}

export const ExpiredResetLink = () => {
  const { t } = useI18n()
  return (
    <InvalidLinkNotice title={t('auth.resetPassword.invalidTokenTitle')} lead={t('auth.resetPassword.invalidTokenLead')}>
      <Button asChild variant="primary" className="h-12 w-full rounded-lg text-base font-semibold">
        <a href="/forgot-password">{t('auth.resetPassword.requestNewLink')}</a>
      </Button>
    </InvalidLinkNotice>
  )
}

// ---------------------------------------------------------------- verify email

const RESEND_SECONDS = 60

export const formatCountdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export const CheckEmail = ({
  email,
  fetcher,
  now = () => Date.now(),
  initialDelaySeconds = RESEND_SECONDS,
}: {
  email: string | null
  fetcher?: typeof fetch
  now?: () => number
  initialDelaySeconds?: number
}) => {
  const { t } = useI18n()
  const { pending, run } = useSubmitGuard()
  const [readyAt, setReadyAt] = useState(() => now() + initialDelaySeconds * 1000)
  const [tick, setTick] = useState(0)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; key: I18nKey } | null>(null)

  // Re-render once a second while the countdown runs.
  useEffect(() => {
    if (now() >= readyAt) return
    const id = setInterval(() => {
      setTick((n) => n + 1)
      if (now() >= readyAt) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [readyAt, now])
  const remaining = Math.max(0, Math.ceil((readyAt - now()) / 1000))
  void tick

  const resend = () => {
    if (!email || remaining > 0) return
    void run(async () => {
      const result = await postAuth('/send-verification-email', { email, callbackURL: VERIFIED_PATH }, { fetcher })
      setReadyAt(now() + RESEND_SECONDS * 1000)
      if (result.ok) return setMessage({ tone: 'success', key: 'auth.verifyEmail.resendSuccess' })
      setMessage({
        tone: 'error',
        key: result.failure === 'rate-limit' ? 'auth.verifyEmail.rateLimit' : result.failure === 'network' ? 'auth.signIn.networkError' : 'common.genericError',
      })
    })
  }

  return (
    <div className="grid gap-5">
      <Ring>
        <MailCheck aria-hidden />
      </Ring>
      <AuthHeading
        title={t('auth.verifyEmail.title')}
        lead={email ? t('auth.verifyEmail.lead', { email }).split(email).flatMap((part, i, all) => (i < all.length - 1 ? [part, <b key={i} className="break-all font-semibold text-text">{email}</b>] : [part])) : t('auth.verifyEmail.leadNoEmail')}
      />
      {email ? (
        <Button
          type="button"
          loading={pending}
          disabled={remaining > 0}
          onClick={resend}
          className="h-12 w-full rounded-lg text-base font-semibold"
        >
          {pending
            ? t('auth.verifyEmail.resending')
            : remaining > 0
              ? t('auth.verifyEmail.resendCountdown', { time: formatCountdown(remaining) })
              : t('auth.verifyEmail.resendBtn')}
        </Button>
      ) : null}
      <div aria-live="polite">
        {message ? message.tone === 'success' ? <Notice tone="success">{t(message.key)}</Notice> : <FormError>{t(message.key)}</FormError> : null}
      </div>
      <Notice>{t('auth.verifyEmail.spamTip')}</Notice>
      <TextLink href="/sign-up" className="-my-2.5 inline-flex min-h-11 w-max items-center">
        {t('auth.verifyEmail.changeEmail')}
      </TextLink>
    </div>
  )
}
