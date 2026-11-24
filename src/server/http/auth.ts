import { Effect, type Layer, Option, Schema } from 'effect'
import { type AppError, CaptchaFailed, PayloadTooLarge, ResourceUnavailable, ValidationError } from '../errors'
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

/**
 * Sign-up display name: at most 64 characters, one line, no link-like text. The name is stored and shown
 * back in the UI; it is never put into outgoing mail.
 */
const DisplayName = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[^\r\n\u2028\u2029]*$/),
  Schema.makeFilter((name) => !/:\/\/|www\./i.test(name)),
)
const SignUpBody = Schema.Struct({ email: Schema.String.check(Schema.isMaxLength(254)), name: DisplayName })

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

/**
 * Reads the JSON body of a clone (the SDK still gets the original), with a hard size cap: a declared
 * content-length over the cap is refused outright, and without one (chunked) the stream is cut as soon as
 * it passes the cap, so an oversized body is never buffered.
 */
const readBody = (request: Request) =>
  Effect.gen(function* () {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return yield* new PayloadTooLarge()
    const stream = request.clone().body
    const text = yield* Effect.tryPromise({
      try: async () => {
        if (stream === null) return ''
        const reader = stream.getReader()
        const chunks: Array<Uint8Array> = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_BODY_BYTES) {
            void reader.cancel().catch(() => undefined)
            return null
          }
          chunks.push(value)
        }
        const all = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          all.set(chunk, offset)
          offset += chunk.byteLength
        }
        return new TextDecoder().decode(all)
      },
      catch: () => invalid('unreadable body'),
    })
    if (text === null) return yield* new PayloadTooLarge()
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
    const emailFrom = readBody(request).pipe(Effect.flatMap(emailOf))
    type Kind = 'signIn' | 'signUp' | 'passwordReset' | 'verificationEmail'
    // IP counter first, then the target (email) counter: an attacker over its IP budget cannot keep burning a victim's counter.
    const byEmail = (kind: Kind) =>
      emailFrom.pipe(
        Effect.flatMap((email) => limiter.hit({ action: kind, ip }).pipe(Effect.andThen(limiter.hit({ action: kind, target: email })))),
      )
    switch (action) {
      case 'signUp': {
        const raw = yield* readBody(request)
        yield* Schema.decodeUnknownEffect(SignUpBody)(raw).pipe(Effect.mapError(() => invalid('invalid name')))
        const email = yield* emailOf(raw)
        // IP counter, then Turnstile, then the target counter: unverified clients cannot lock an address.
        yield* limiter.hit({ action: 'signUp', ip })
        const token = request.headers.get(TURNSTILE_HEADER)
        if (token === null || token === '') return yield* new CaptchaFailed({ reason: 'missing-token' })
        yield* Turnstile.use((t) => t.verify({ token, action: 'signup', ip }))
        return yield* limiter.hit({ action: 'signUp', target: email })
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
