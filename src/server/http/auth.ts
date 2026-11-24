import { Effect, type Layer, Option, Schema } from 'effect'
import { type AppError, CaptchaFailed, ResourceUnavailable, ValidationError } from '../errors'
import { AppConfig } from '../services/AppConfig'
import { Auth } from '../services/Auth'
import { RateLimit } from '../services/RateLimit'
import { Turnstile } from '../services/Turnstile'
import { type IdentityAction, matchIdentityRoute } from './authAllowlist'
import { checkMutationRequest } from './csrf'
import { handle, type RequestMeta } from './respond'

const MAX_BODY_BYTES = 16 * 1024

/** `x-turnstile-token` carries the sign-up widget's token (it is not a field of the SDK's body). */
export const TURNSTILE_HEADER = 'x-turnstile-token'

const Target = Schema.Struct({ email: Schema.String.check(Schema.isMaxLength(254)) })

/** Same-site relative path only: `/x`, never `//host`, `/\host` or an absolute URL. */
const RelativePath = Schema.String.check(Schema.isPattern(/^\/(?![/\\])[^\r\n]*$/), Schema.isMaxLength(2048))

/**
 * `/sign-in/social` accepts Google's redirect flow only: provider, redirect targets and `disableRedirect`.
 * Anything else, notably `idToken` (direct token sign-in) or link-related input, is rejected before the SDK.
 */
const SocialBody = Schema.Struct({
  provider: Schema.Literal('google'),
  callbackURL: Schema.optional(RelativePath),
  errorCallbackURL: Schema.optional(RelativePath),
  newUserCallbackURL: Schema.optional(RelativePath),
  disableRedirect: Schema.optional(Schema.Boolean),
})

const invalid = (message: string) => new ValidationError({ message })

/** Reads the JSON body of a clone (the SDK still gets the original), with a size cap. */
const readBody = (request: Request) =>
  Effect.gen(function* () {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return yield* invalid('body too large')
    const text = yield* Effect.tryPromise({ try: () => request.clone().text(), catch: () => invalid('unreadable body') })
    if (text.length > MAX_BODY_BYTES) return yield* invalid('body too large')
    return yield* Effect.try({ try: (): unknown => JSON.parse(text), catch: () => invalid('invalid JSON') })
  })

const emailOf = (body: unknown) =>
  Schema.decodeUnknownEffect(Target)(body).pipe(
    Effect.map(({ email }) => email.trim().toLowerCase()),
    Effect.mapError(() => invalid('email required')),
  )

const clientIp = (request: Request) => request.headers.get('cf-connecting-ip')

/** Protections that run BEFORE the SDK: rate limit (and Turnstile for sign-up), per action. */
const guard = (action: IdentityAction, request: Request) =>
  Effect.gen(function* () {
    const limiter = yield* RateLimit
    const ip = clientIp(request)
    const byEmail = (kind: 'signIn' | 'signUp' | 'passwordReset' | 'verificationEmail') =>
      readBody(request).pipe(
        Effect.flatMap(emailOf),
        Effect.flatMap((email) => limiter.hit({ action: kind, target: email, ip })),
      )
    switch (action) {
      case 'signUp': {
        yield* byEmail('signUp')
        const token = request.headers.get(TURNSTILE_HEADER)
        if (token === null || token === '') return yield* new CaptchaFailed({ reason: 'missing-token' })
        yield* Turnstile.use((t) => t.verify({ token, action: 'signup', ip }))
        return
      }
      case 'signIn':
        return yield* byEmail('signIn')
      case 'requestPasswordReset':
        return yield* byEmail('passwordReset')
      case 'sendVerificationEmail':
        return yield* byEmail('verificationEmail')
      case 'resetPassword':
        // The token is the secret; throttle guessing per IP before the SDK looks it up.
        return yield* limiter.hit({ action: 'passwordReset', ip })
      case 'signInSocial': {
        yield* readBody(request).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(SocialBody, { onExcessProperty: 'error' })),
          Effect.mapError(() => invalid('unsupported social sign-in request')),
        )
        return yield* limiter.hit({ action: 'signIn', ip })
      }
      default:
        return
    }
  })

/** Identity responses are private: never cached by the edge or the browser, never carry a Referer on. */
const sealed = (response: Response) => {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'private, no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/**
 * `/api/auth/*`: allowlist (404 for everything else) -> CSRF for POST -> rate limit / Turnstile -> better-auth.
 * Nothing outside the allowlist ever reaches the SDK, so `/organization/*` and `/admin/*` do not exist from outside.
 */
export const identityProgram = (request: Request) =>
  Effect.gen(function* () {
    const route = matchIdentityRoute(request.method, new URL(request.url).pathname)
    if (Option.isNone(route)) return yield* new ResourceUnavailable()
    if (route.value.method === 'POST') {
      const { trustedOrigins } = yield* AppConfig
      yield* checkMutationRequest(request, trustedOrigins)
    }
    yield* guard(route.value.action, request)
    return sealed(yield* Auth.use((auth) => auth.handleIdentityRequest(request)))
  })

export const identityResponse = (
  request: Request,
  layer: Layer.Layer<Auth | RateLimit | Turnstile | AppConfig, AppError>,
  meta: RequestMeta,
) => handle(identityProgram(request), layer, meta)
