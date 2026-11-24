/** Browser-side client for the open `/api/auth/*` endpoints. No `effect` here: this code ships to the client. */

export type AuthFailure =
  | 'invalid-credentials'
  | 'email-not-verified'
  | 'rate-limit'
  | 'captcha'
  | 'email-exists'
  | 'invalid-token'
  | 'network'
  | 'generic'

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly failure: AuthFailure; readonly status: number }

export const TURNSTILE_HEADER = 'x-turnstile-token'

type ErrorBody = { code?: unknown; error?: unknown }

const readBody = async (response: Response): Promise<ErrorBody> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as ErrorBody) : {}
  } catch {
    return {}
  }
}

/** Maps a failed response to one UI-facing reason. Sign-in never tells "no such account" from "wrong password". */
export const mapAuthFailure = (status: number, body: ErrorBody): AuthFailure => {
  const code = typeof body.code === 'string' ? body.code : ''
  const tag = typeof body.error === 'string' ? body.error : ''
  if (status === 429 || tag === 'RateLimitExceeded') return 'rate-limit'
  if (tag === 'CaptchaFailed') return 'captcha'
  if (code === 'EMAIL_NOT_VERIFIED') return 'email-not-verified'
  if (code.includes('INVALID_TOKEN') || code.includes('TOKEN_EXPIRED')) return 'invalid-token'
  if (code.includes('USER_ALREADY_EXISTS')) return 'email-exists'
  if (status === 401 || code === 'INVALID_EMAIL_OR_PASSWORD') return 'invalid-credentials'
  return 'generic'
}

export const postAuth = async (
  path: string,
  body: Record<string, unknown>,
  options: { headers?: Record<string, string>; fetcher?: typeof fetch | undefined } = {},
): Promise<AuthResult & { data?: unknown }> => {
  const fetcher = options.fetcher ?? fetch
  try {
    const response = await fetcher(`/api/auth${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
    })
    if (response.ok) {
      const data: unknown = await response.json().catch(() => undefined)
      return { ok: true, data }
    }
    return { ok: false, status: response.status, failure: mapAuthFailure(response.status, await readBody(response)) }
  } catch {
    return { ok: false, status: 0, failure: 'network' }
  }
}

const PENDING_EMAIL_KEY = 'vizcad_pending_email'

/** The address a verification mail went to, kept for the "check your email" screen (tab-only, never in the URL). */
export const rememberPendingEmail = (email: string) => {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email)
  } catch {
    // storage blocked: the screen falls back to wording without the address
  }
}

export const readPendingEmail = (): string | null => {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY)
  } catch {
    return null
  }
}
