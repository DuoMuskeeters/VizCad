import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as AppConfig from './AppConfig'
import { Turnstile, test as TurnstileTest, type VerifyRequest } from './Turnstile'
import * as TurnstileLive from './Turnstile.live'

const ok = { success: true, action: 'signup', hostname: 'vizcad.test' }

/** Fake siteverify: answers with `reply` (or rejects when it is an Error) and records each form body. */
const siteverify = (reply: unknown, status = 200) => {
  const calls: Array<FormData> = []
  const fetchFn: typeof fetch = (_input, init) => {
    if (init?.body instanceof FormData) calls.push(init.body)
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(Response.json(reply, { status }))
  }
  return { calls, fetchFn }
}

const verify = (reply: unknown, request: VerifyRequest = { token: 'tok', action: 'signup', ip: '203.0.113.7' }, status = 200) => {
  const fake = siteverify(reply, status)
  return Turnstile.use((t) => t.verify(request)).pipe(
    Effect.provide(TurnstileLive.make(fake.fetchFn).pipe(Layer.provide(AppConfig.test()))),
    Effect.result,
    Effect.map((result) => ({ result, calls: fake.calls })),
  )
}

const reasonOf = (reply: unknown, request?: VerifyRequest) =>
  verify(reply, request).pipe(Effect.map(({ result }) => (result._tag === 'Failure' ? result.failure.reason : 'ok')))

describe('Turnstile.live', () => {
  it.effect('accepts a successful token for the expected action and hostname', () =>
    Effect.gen(function* () {
      const { result, calls } = yield* verify(ok)
      assert.strictEqual(result._tag, 'Success')
      assert.strictEqual(calls[0]?.get('secret'), 'test-turnstile-secret')
      assert.strictEqual(calls[0]?.get('response'), 'tok')
      assert.strictEqual(calls[0]?.get('remoteip'), '203.0.113.7')
    }),
  )

  it.effect('reports why a token was rejected', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* reasonOf({ success: false, 'error-codes': ['timeout-or-duplicate'] }), 'timeout-or-duplicate')
      assert.strictEqual(yield* reasonOf({ success: false }), 'rejected')
      assert.strictEqual(yield* reasonOf({ ...ok, action: 'login' }), 'action-mismatch')
      assert.strictEqual(yield* reasonOf({ ...ok, hostname: 'evil.example' }), 'hostname-mismatch')
      assert.strictEqual(yield* reasonOf({ success: true, action: 'signup' }), 'hostname-mismatch')
      assert.strictEqual(yield* reasonOf({ nope: 1 }), 'malformed-response')
      assert.strictEqual(yield* reasonOf(new Error('network down')), 'unreachable')
    }),
  )

  it.effect('a non-2xx siteverify response fails even when its body looks like success', () =>
    Effect.gen(function* () {
      for (const status of [500, 503, 429]) {
        const { result } = yield* verify(ok, undefined, status)
        assert.strictEqual(result._tag === 'Failure' && result.failure.reason, `siteverify-http-${status}`)
      }
    }),
  )

  it.effect('a non-JSON body fails as malformed', () =>
    Effect.gen(function* () {
      const fetchFn: typeof fetch = () => Promise.resolve(new Response('<html>oops</html>', { status: 200 }))
      const error = yield* Turnstile.use((t) => t.verify({ token: 'tok', action: 'signup', ip: null })).pipe(
        Effect.provide(TurnstileLive.make(fetchFn).pipe(Layer.provide(AppConfig.test()))),
        Effect.flip,
      )
      assert.strictEqual(error.reason, 'malformed-response')
    }),
  )

  it.effect('rejects empty or oversized tokens without calling siteverify', () =>
    Effect.gen(function* () {
      for (const token of ['', 'x'.repeat(2049)]) {
        const { result, calls } = yield* verify(ok, { token, action: 'signup', ip: null })
        assert.strictEqual(result._tag === 'Failure' && result.failure.reason, 'invalid-token')
        assert.strictEqual(calls.length, 0)
      }
    }),
  )
})

describe('Turnstile.test', () => {
  it.effect('accepts any token except "fail"', () =>
    Effect.gen(function* () {
      const t = yield* Turnstile
      yield* t.verify({ token: 'anything', action: 'signup', ip: null })
      const error = yield* t.verify({ token: 'fail', action: 'signup', ip: null }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'CaptchaFailed')
    }).pipe(Effect.provide(TurnstileTest)),
  )
})
