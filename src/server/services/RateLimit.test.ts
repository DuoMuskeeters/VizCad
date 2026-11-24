import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import * as AppConfig from './AppConfig'
import { RateLimit, memory, unavailable } from './RateLimit'
import * as RateLimitLive from './RateLimit.live'
import { advance, isValidRule } from './rateLimitWindow'

const config = AppConfig.test({
  rateLimits: {
    ...AppConfig.defaultRateLimits,
    signIn: { target: { limit: 2, windowSeconds: 60 }, ip: { limit: 3, windowSeconds: 60 } },
  },
})
const withMemory = Effect.provide(memory.pipe(Layer.provide(config)))

describe('rateLimitWindow', () => {
  const rule = { limit: 2, windowSeconds: 10 }

  it('counts within a window, denies over the limit, resets after the window', () => {
    const first = advance(undefined, 1_000, rule)
    const second = advance(first.state, 2_000, rule)
    const third = advance(second.state, 3_000, rule)
    assert.deepStrictEqual([first.result.allowed, second.result.allowed, third.result.allowed], [true, true, false])
    assert.strictEqual(third.result.retryAfterSeconds, 8)
    assert.strictEqual(third.state.count, 2, 'denied hits are not counted')
    const later = advance(third.state, 11_000, rule)
    assert.isTrue(later.result.allowed)
    assert.strictEqual(later.state.count, 1)
  })

  it('validates rules', () => {
    assert.isTrue(isValidRule(rule))
    assert.isFalse(isValidRule({ limit: -1, windowSeconds: 10 }))
    assert.isFalse(isValidRule({ limit: 1, windowSeconds: 0 }))
    assert.isFalse(isValidRule({ limit: 1.5, windowSeconds: 10 }))
    assert.isFalse(isValidRule({ limit: 1, windowSeconds: 100_000 }))
  })
})

describe('RateLimit (in-memory)', () => {
  it.effect('limits per target, normalizing case and whitespace; other targets are unaffected', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimit
      yield* limiter.hit({ action: 'signIn', target: 'Ada@Example.com' })
      yield* limiter.hit({ action: 'signIn', target: ' ada@example.com ' })
      const error = yield* limiter.hit({ action: 'signIn', target: 'ada@example.com' }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'RateLimitExceeded')
      if (error._tag === 'RateLimitExceeded') assert.strictEqual(error.retryAfterSeconds, 60)
      yield* limiter.hit({ action: 'signIn', target: 'lin@example.com' })
    }).pipe(withMemory),
  )

  it.effect('limits per IP across targets, and actions have separate counters', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimit
      for (const target of ['a@x.test', 'b@x.test', 'c@x.test']) yield* limiter.hit({ action: 'signIn', target, ip: '203.0.113.7' })
      const error = yield* limiter.hit({ action: 'signIn', target: 'd@x.test', ip: '203.0.113.7' }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'RateLimitExceeded')
      yield* limiter.hit({ action: 'signUp', target: 'a@x.test', ip: '203.0.113.7' })
      yield* limiter.hit({ action: 'signIn', target: 'd@x.test', ip: '203.0.113.8' })
    }).pipe(withMemory),
  )

  it.effect('the window resets with time', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimit
      yield* limiter.hit({ action: 'signIn', target: 'a@x.test' })
      yield* limiter.hit({ action: 'signIn', target: 'a@x.test' })
      assert.strictEqual((yield* limiter.hit({ action: 'signIn', target: 'a@x.test' }).pipe(Effect.flip))._tag, 'RateLimitExceeded')
      yield* TestClock.adjust('61 seconds')
      yield* limiter.hit({ action: 'signIn', target: 'a@x.test' })
    }).pipe(withMemory),
  )

  it.effect('a hit with neither target nor IP counts nothing', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimit
      for (let i = 0; i < 10; i++) yield* limiter.hit({ action: 'signIn' })
    }).pipe(withMemory),
  )

  it.effect('fails closed with RateLimitError when counters are unreachable', () =>
    Effect.gen(function* () {
      const error = yield* RateLimit.use((l) => l.hit({ action: 'signIn', target: 'a@x.test' })).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'RateLimitError')
    }).pipe(Effect.provide(unavailable.pipe(Layer.provide(config)))),
  )
})

describe('RateLimit.live', () => {
  const fakeNamespace = (calls: Array<string>, fail = false): RateLimitLive.CounterNamespace => ({
    getByName: (name) => ({
      hit: () => {
        calls.push(name)
        return fail ? Promise.reject(new Error('DO unreachable')) : Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
      },
    }),
  })

  it.effect('uses hashed counter names: no email address or IP in the Durable Object name', () => {
    const calls: Array<string> = []
    return Effect.gen(function* () {
      yield* RateLimit.use((l) => l.hit({ action: 'passwordReset', target: 'Ada@Example.com', ip: '203.0.113.7' }))
      assert.strictEqual(calls.length, 2)
      assert.match(calls[0] ?? '', /^passwordReset:target:[0-9a-f]{64}$/)
      assert.match(calls[1] ?? '', /^passwordReset:ip:[0-9a-f]{64}$/)
      assert.notInclude(calls.join(), 'ada')
      assert.notInclude(calls.join(), '203.0.113')
    }).pipe(Effect.provide(RateLimitLive.layer(fakeNamespace(calls)).pipe(Layer.provide(config))))
  })

  it.effect('a Durable Object failure is RateLimitError', () =>
    Effect.gen(function* () {
      const error = yield* RateLimit.use((l) => l.hit({ action: 'signIn', target: 'a@x.test' })).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'RateLimitError')
    }).pipe(Effect.provide(RateLimitLive.layer(fakeNamespace([], true)).pipe(Layer.provide(config)))),
  )

  it.effect('a denied counter is 429 with the retry time', () =>
    Effect.gen(function* () {
      const denied: RateLimitLive.CounterNamespace = { getByName: () => ({ hit: () => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }) }) }
      const error = yield* RateLimit.use((l) => l.hit({ action: 'signIn', target: 'a@x.test' })).pipe(
        Effect.provide(RateLimitLive.layer(denied).pipe(Layer.provide(config))),
        Effect.flip,
      )
      assert.deepStrictEqual(error._tag === 'RateLimitExceeded' && error.retryAfterSeconds, 42)
    }),
  )
})
