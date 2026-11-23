import { Effect, Layer, Redacted, Schema } from 'effect'
import { CaptchaFailed } from '../errors'
import { AppConfig } from './AppConfig'
import { Turnstile } from './Turnstile'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const SiteverifyResponse = Schema.Struct({
  success: Schema.Boolean,
  'error-codes': Schema.optional(Schema.Array(Schema.String)),
  action: Schema.optional(Schema.String),
  hostname: Schema.optional(Schema.String),
})

/** Live implementation calling siteverify. `fetchFn` is injectable so the logic is testable without network. */
export const make = (fetchFn: typeof fetch) =>
  Layer.effect(
    Turnstile,
    Effect.gen(function* () {
      const { turnstile } = yield* AppConfig
      return Turnstile.of({
        verify: ({ token, action, ip }) =>
          Effect.gen(function* () {
            // Turnstile tokens are at most 2048 characters; reject anything else without a network call.
            if (token.length === 0 || token.length > 2048) return yield* new CaptchaFailed({ reason: 'invalid-token' })

            const body = new FormData()
            body.set('secret', Redacted.value(turnstile.secret))
            body.set('response', token)
            if (ip) body.set('remoteip', ip)

            const json = yield* Effect.tryPromise({
              try: (signal) => fetchFn(VERIFY_URL, { method: 'POST', body, signal }).then((r) => r.json()),
              catch: () => new CaptchaFailed({ reason: 'unreachable' }),
            })
            const result = yield* Schema.decodeUnknownEffect(SiteverifyResponse)(json).pipe(
              Effect.mapError(() => new CaptchaFailed({ reason: 'malformed-response' })),
            )
            if (!result.success) {
              return yield* new CaptchaFailed({ reason: result['error-codes']?.join(',') || 'rejected' })
            }
            if (result.action !== action) return yield* new CaptchaFailed({ reason: 'action-mismatch' })
            if (!result.hostname || !turnstile.hostnames.has(result.hostname.toLowerCase())) {
              return yield* new CaptchaFailed({ reason: 'hostname-mismatch' })
            }
          }),
      })
    }),
  )

export const layer = make((input, init) => fetch(input, init))
