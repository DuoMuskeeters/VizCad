// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../components/ui/test-utils'
import { I18nProvider } from '#/i18n'
import { mapAuthFailure } from './api'
import { CheckEmail, ForgotPasswordForm, ResetPasswordForm, SignInForm, SignUpForm } from './forms'
import { signInMessage } from './messages'
import { validateEmail, validateName, validateNewPassword } from './validation'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const wrap = (node: React.ReactNode) => render(<I18nProvider initialLocale="en">{node}</I18nProvider>)

describe('validation', () => {
  it('mirrors the server name rules', () => {
    expect(validateName('  ')).toBe('auth.signUp.nameRequired')
    expect(validateName('a'.repeat(65))).toBe('auth.signUp.nameTooLong')
    expect(validateName('see https://x.test')).toBe('auth.signUp.nameInvalid')
    expect(validateName('visit www.x.test')).toBe('auth.signUp.nameInvalid')
    expect(validateName('Ayşe\nYılmaz')).toBe('auth.signUp.nameInvalid')
    expect(validateName('Ayşe Yılmaz')).toBeNull()
  })
  it('checks email and password length', () => {
    expect(validateEmail('nope')).toBe('auth.signUp.emailInvalid')
    expect(validateEmail('a@b.co')).toBeNull()
    expect(validateNewPassword('1234567')).toBe('auth.signUp.passwordTooShort')
    expect(validateNewPassword('12345678')).toBeNull()
    expect(validateNewPassword('x'.repeat(129))).toBe('common.passwordTooLong')
  })
})

describe('error mapping', () => {
  it('maps statuses and codes', () => {
    expect(mapAuthFailure(429, { error: 'RateLimitExceeded' })).toBe('rate-limit')
    expect(mapAuthFailure(403, { error: 'CaptchaFailed' })).toBe('captcha')
    expect(mapAuthFailure(403, { code: 'EMAIL_NOT_VERIFIED' })).toBe('email-not-verified')
    expect(mapAuthFailure(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('invalid-credentials')
    expect(mapAuthFailure(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe('email-exists')
    expect(mapAuthFailure(400, { code: 'INVALID_TOKEN' })).toBe('invalid-token')
    expect(mapAuthFailure(500, {})).toBe('generic')
  })
  it('sign-in shows one message for unknown account and wrong password', () => {
    expect(signInMessage('invalid-credentials')).toBe(signInMessage('generic'))
  })
})

describe('SignInForm', () => {
  it('shows field errors and does not call the server', async () => {
    const fetcher = vi.fn()
    wrap(<SignInForm onSuccess={() => {}} fetcher={fetcher} google={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your password.')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('shows the generic error on 401 and the wait message on 429', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })).mockResolvedValueOnce(json(429, { ok: false, error: 'RateLimitExceeded' }))
    wrap(<SignInForm onSuccess={() => {}} fetcher={fetcher} google={false} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'a@b.co')
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Too many attempts. Please try again later.')).toBeInTheDocument()
  })

  it('submits once on success and calls onSuccess; double click does not double send', async () => {
    let release: (r: Response) => void = () => {}
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const onSuccess = vi.fn()
    wrap(<SignInForm onSuccess={onSuccess} fetcher={fetcher} google={false} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'A@B.co')
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret-pass')
    const button = screen.getByRole('button', { name: 'Sign in' })
    await userEvent.dblClick(button)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Signing in...' })).toHaveAttribute('aria-busy', 'true')
    release(json(200, { token: 't' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.co', password: 'secret-pass' })
  })

  it('hides the Google button unless enabled', () => {
    const { unmount } = wrap(<SignInForm onSuccess={() => {}} google={false} />)
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
    unmount()
    wrap(<SignInForm onSuccess={() => {}} google />)
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument()
  })
})

describe('SignUpForm', () => {
  it('validates name, email, password before sending', async () => {
    const fetcher = vi.fn()
    wrap(<SignUpForm onSuccess={() => {}} fetcher={fetcher} google={false} />)
    await userEvent.type(screen.getByLabelText(/Full name/), 'see www.x.test')
    await userEvent.type(screen.getByLabelText(/Email/), 'bad')
    await userEvent.type(screen.getByLabelText(/^Password/), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Name must be a single line and cannot contain URLs.')).toBeInTheDocument()
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('asks for the verification when no Turnstile token exists yet', async () => {
    const fetcher = vi.fn()
    wrap(<SignUpForm onSuccess={() => {}} fetcher={fetcher} google={false} />)
    await userEvent.type(screen.getByLabelText(/Full name/), 'Ayşe Yılmaz')
    await userEvent.type(screen.getByLabelText(/Email/), 'a@b.co')
    await userEvent.type(screen.getByLabelText(/^Password/), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Please complete the verification.')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('ForgotPasswordForm', () => {
  it('gives the same message whether or not the account exists', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(400, { code: 'USER_NOT_FOUND' }))
    wrap(<ForgotPasswordForm fetcher={fetcher} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'ghost@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText(/If an account exists for this email/)).toBeInTheDocument()
  })
  it('shows the wait message on 429', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(429, { error: 'RateLimitExceeded' }))
    wrap(<ForgotPasswordForm fetcher={fetcher} />)
    await userEvent.type(screen.getByLabelText(/Email/), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Too many attempts. Please try again later.')).toBeInTheDocument()
  })
})

describe('ResetPasswordForm', () => {
  it('sends token and new password, then shows success', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(200, { status: true }))
    wrap(<ResetPasswordForm token="tok_1" fetcher={fetcher} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Password updated')).toBeInTheDocument()
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ newPassword: 'brand-new-pass', token: 'tok_1' })
  })
  it('shows the expired-link screen on an invalid token', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(400, { code: 'INVALID_TOKEN' }))
    wrap(<ResetPasswordForm token="old" fetcher={fetcher} />)
    await userEvent.type(screen.getByLabelText(/New password/), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Invalid or expired reset link')).toBeInTheDocument()
  })
})

describe('CheckEmail', () => {
  it('keeps resend disabled during the countdown', () => {
    wrap(<CheckEmail email="a@b.co" now={() => 0} />)
    expect(screen.getByRole('button', { name: /Resend \(1:00\)/ })).toHaveAttribute('disabled')
  })
  it('resends when ready and reports the rate limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(429, { error: 'RateLimitExceeded' }))
    wrap(<CheckEmail email="a@b.co" fetcher={fetcher} now={() => 0} initialDelaySeconds={0} />)
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
  })
})
