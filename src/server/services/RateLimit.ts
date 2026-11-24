import { Clock, Context, Effect, Layer, Ref } from 'effect'
import { RateLimitError, RateLimitExceeded } from '../errors'
import { AppConfig, type RateLimitAction } from './AppConfig'
import { advance, type CounterResult, type RateLimitRule, type WindowState } from './rateLimitWindow'

export interface RateLimitHit {
  readonly action: RateLimitAction
  /** Normalized target (email address, link id, ...). Hashed before it is used as a counter name. Omit for IP-only checks. */
  readonly target?: string | undefined
  /** Client IP (`cf-connecting-ip`). Omit when unknown. */
  readonly ip?: string | null | undefined
}

/**
 * Shared counters for sign-in, sign-up, password reset and verification email (docs/08 §1). One hit
 * counts against the target and IP counters of the action's rules (from AppConfig). Call it BEFORE the
 * SDK, hashing or sending mail. Exceeding a limit fails with RateLimitExceeded (429); unreachable
 * counters fail with RateLimitError: callers must not run the protected operation (fail closed).
 * Live layer: RateLimit.live.ts (Durable Object). Test layer: `memory`.
 */
export class RateLimit extends Context.Service<
  RateLimit,
  {
    readonly hit: (input: RateLimitHit) => Effect.Effect<void, RateLimitExceeded | RateLimitError>
  }
>()('vizcad/RateLimit') {}

/** One counter by name: how a backend (Durable Object, memory) consumes a hit. */
export type Counter = (name: string, rule: RateLimitRule) => Effect.Effect<CounterResult, RateLimitError>

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** SHA-256 so counter names (and Durable Object names) never contain an email address or IP. */
export const counterName = (action: RateLimitAction, scope: 'target' | 'ip', value: string) =>
  Effect.tryPromise({
    try: () => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    catch: (cause) => new RateLimitError({ cause }),
  }).pipe(Effect.map((digest) => `${action}:${scope}:${hex(digest)}`))

/** Builds the service from a counter backend. Shared by the live and in-memory layers. */
export const make = (counter: Counter) =>
  Effect.gen(function* () {
    const { rateLimits } = yield* AppConfig
    return RateLimit.of({
      hit: ({ action, target, ip }) =>
        Effect.gen(function* () {
          const rules = rateLimits[action]
          // IP first: a client over its IP budget must not also burn the (victim's) target counter.
          const checks = [
            ...(ip ? [{ scope: 'ip' as const, value: ip.trim(), rule: rules.ip }] : []),
            ...(target === undefined ? [] : [{ scope: 'target' as const, value: target.trim().toLowerCase(), rule: rules.target }]),
          ]
          for (const { scope, value, rule } of checks) {
            const result = yield* counterName(action, scope, value).pipe(Effect.flatMap((name) => counter(name, rule)))
            if (!result.allowed) return yield* new RateLimitExceeded({ retryAfterSeconds: result.retryAfterSeconds })
          }
        }),
    })
  })

/** In-memory counters for tests; time comes from Effect's Clock, so tests can use TestClock. */
export const memory = Layer.effect(
  RateLimit,
  Effect.gen(function* () {
    const windows = yield* Ref.make(new Map<string, WindowState>())
    return yield* make((name, rule) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* Ref.modify(windows, (all) => {
          const next = advance(all.get(name), now, rule)
          return [next.result, new Map(all).set(name, next.state)] as const
        })
      }),
    )
  }),
)

/** A backend that is down, to test fail-closed behavior. */
export const unavailable = Layer.effect(RateLimit, make(() => Effect.fail(new RateLimitError({ cause: 'counters unreachable' }))))
