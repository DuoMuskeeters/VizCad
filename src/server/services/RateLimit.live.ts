import { Effect, Layer } from 'effect'
import { RateLimitError } from '../errors'
import { make, RateLimit } from './RateLimit'
import type { CounterResult, RateLimitRule } from './rateLimitWindow'

/** The slice of the `RATE_LIMITER` Durable Object namespace this layer uses (see src/server/durable/RateLimiter.ts). */
export interface CounterNamespace {
  readonly getByName: (name: string) => { readonly hit: (rule: RateLimitRule) => Promise<CounterResult> }
}

/**
 * Counters in Durable Objects, one instance per counter name. Any failure to reach one is a RateLimitError,
 * so protected operations do not run when counting is impossible.
 */
export const layer = (namespace: CounterNamespace) =>
  Layer.effect(
    RateLimit,
    make((name, rule) =>
      Effect.tryPromise({ try: () => namespace.getByName(name).hit(rule), catch: (cause) => new RateLimitError({ cause }) }),
    ),
  )
