import { Option } from 'effect'

/**
 * The better-auth HTTP surface (docs/08 §1, security review 2.1 to 2.4). One table, exact match on
 * (method, canonical path). Anything else, including every `/organization/*` and `/admin/*` path,
 * `/update-user`, `/delete-user*`, `/link-social`, `/unlink-account`, `/get-access-token`, `/refresh-token`
 * and `/account-info`, is simply absent: it never reaches the SDK and answers 404.
 */
export const IDENTITY_BASE_PATH = '/api/auth'

export type IdentityAction =
  | 'signUp'
  | 'signIn'
  | 'signInSocial'
  | 'signOut'
  | 'sendVerificationEmail'
  | 'requestPasswordReset'
  | 'resetPassword'
  | 'googleCallback'
  | 'getSession'
  | 'verifyEmail'
  | 'resetPasswordToken'

export const POST_ROUTES: Readonly<Record<string, IdentityAction>> = {
  '/sign-up/email': 'signUp',
  '/sign-in/email': 'signIn',
  '/sign-in/social': 'signInSocial',
  '/sign-out': 'signOut',
  '/send-verification-email': 'sendVerificationEmail',
  '/request-password-reset': 'requestPasswordReset',
  '/reset-password': 'resetPassword',
}

export const GET_ROUTES: Readonly<Record<string, IdentityAction>> = {
  '/callback/google': 'googleCallback',
  '/get-session': 'getSession',
  '/verify-email': 'verifyEmail',
}

/** `/reset-password/:token`: exactly one token segment of URL-safe characters. */
const RESET_TOKEN_PATH = /^\/reset-password\/[A-Za-z0-9_-]{1,128}$/

/** Anything that is not already the canonical spelling of a path: encoded characters, empty or dot segments, a trailing slash. */
const isCanonical = (path: string) =>
  path.startsWith('/') &&
  !path.includes('%') &&
  !path.includes('\\') &&
  !path.includes('//') &&
  !path.endsWith('/') &&
  !path.split('/').some((segment) => segment === '.' || segment === '..')

export interface IdentityRoute {
  readonly action: IdentityAction
  readonly method: 'GET' | 'POST'
}

/**
 * Matches a request's method and URL path against the allowlist. Case-sensitive on purpose: `/SIGN-IN/EMAIL`,
 * `GET /sign-in/email`, `HEAD`, `OPTIONS` and `/api/auth/sign-in/email/` all fall through to None.
 */
export const matchIdentityRoute = (method: string, pathname: string): Option.Option<IdentityRoute> => {
  if (method !== 'GET' && method !== 'POST') return Option.none()
  if (!pathname.startsWith(`${IDENTITY_BASE_PATH}/`)) return Option.none()
  const path = pathname.slice(IDENTITY_BASE_PATH.length)
  if (!isCanonical(path)) return Option.none()
  if (method === 'POST') {
    const action = Object.hasOwn(POST_ROUTES, path) ? POST_ROUTES[path] : undefined
    return action === undefined ? Option.none() : Option.some({ action, method })
  }
  if (RESET_TOKEN_PATH.test(path)) return Option.some({ action: 'resetPasswordToken', method })
  const action = Object.hasOwn(GET_ROUTES, path) ? GET_ROUTES[path] : undefined
  return action === undefined ? Option.none() : Option.some({ action, method })
}
