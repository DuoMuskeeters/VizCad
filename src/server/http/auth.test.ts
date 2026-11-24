import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { AuthError } from '../errors'
import * as AppConfig from '../services/AppConfig'
import { Auth, MemoryAuth, memory as authMemory } from '../services/Auth'
import { memory as rateLimitMemory, unavailable } from '../services/RateLimit'
import { Turnstile, test as TurnstileTest } from '../services/Turnstile'
import { TURNSTILE_HEADER, identityResponse } from './auth'

const ORIGIN = 'https://vizcad.test'
const meta = { requestId: 'ray-1' }

const config = AppConfig.test({
  rateLimits: {
    ...AppConfig.defaultRateLimits,
    signIn: { target: { limit: 2, windowSeconds: 60 }, ip: { limit: 100, windowSeconds: 60 } },
    signUp: { target: { limit: 1, windowSeconds: 60 }, ip: { limit: 100, windowSeconds: 60 } },
  },
})

// RateLimit needs AppConfig; the same AppConfig is also exposed to the program.
const baseLayer = Layer.mergeAll(authMemory, rateLimitMemory, TurnstileTest, config).pipe(Layer.provideMerge(config))

const json = (path: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

const run = (request: Request, layer: Layer.Layer<Auth | never, never, never> = baseLayer as never) => identityResponse(request, layer as never, meta)
const handled = Effect.gen(function* () {
  return (yield* Ref.get(yield* MemoryAuth)).handled
})
const body = (response: Response) => Effect.promise(() => response.json() as Promise<{ ok: boolean; error?: string }>)

const signUpHeaders = { [TURNSTILE_HEADER]: 'good-token' }

describe('identity HTTP surface', () => {
  it.effect('forwards an allowlisted request to the SDK with private, no-store headers', () =>
    Effect.gen(function* () {
      const response = yield* run(json('/sign-in/email', { email: 'ada@example.com', password: 'x' }))
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get('cache-control'), 'private, no-store')
      assert.strictEqual(response.headers.get('referrer-policy'), 'no-referrer')
      assert.deepStrictEqual(yield* handled, ['POST /api/auth/sign-in/email'])
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('/organization/* and /admin/* answer 404 and never reach the SDK', () =>
    Effect.gen(function* () {
      for (const path of ['/organization/list-members', '/organization/get-full-organization', '/organization/set-active', '/admin/list-users', '/admin/remove-user', '/update-user', '/link-social', '/organization/']) {
        for (const method of ['GET', 'POST']) {
          const response = yield* run(json(path, {}, {}, method))
          assert.strictEqual(response.status, 404, `${method} ${path}`)
          assert.deepStrictEqual(yield* body(response), { ok: false, error: 'ResourceUnavailable' })
        }
      }
      assert.deepStrictEqual(yield* handled, [])
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('GET on a POST endpoint and POST on a GET endpoint are 404', () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* run(json('/sign-in/email', {}, {}, 'GET'))).status, 404)
      assert.strictEqual((yield* run(json('/get-session', {}))).status, 404)
      assert.deepStrictEqual(yield* handled, [])
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('GET identity endpoints (session, callbacks, links) pass without an Origin', () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* run(new Request(`${ORIGIN}/api/auth/get-session`))).status, 200)
      assert.strictEqual((yield* run(new Request(`${ORIGIN}/api/auth/verify-email?token=t`))).status, 200)
      assert.strictEqual((yield* run(new Request(`${ORIGIN}/api/auth/callback/google?code=c&state=s`))).status, 200)
      assert.strictEqual((yield* run(new Request(`${ORIGIN}/api/auth/reset-password/abc123`))).status, 200)
      assert.strictEqual((yield* handled).length, 4)
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('CSRF: cross-origin, missing Origin, cross-site fetch metadata and form posts are 403 before the SDK', () =>
    Effect.gen(function* () {
      const bodyValue = { email: 'ada@example.com', password: 'x' }
      const cases = [
        json('/sign-in/email', bodyValue, { origin: 'https://evil.test' }),
        json('/sign-in/email', bodyValue, { origin: 'null' }),
        new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyValue) }),
        json('/sign-in/email', bodyValue, { 'sec-fetch-site': 'cross-site' }),
        json('/sign-out', {}, { 'content-type': 'application/x-www-form-urlencoded' }),
        json('/sign-out', {}, { 'content-type': 'text/plain' }),
      ]
      for (const request of cases) {
        const response = yield* run(request)
        assert.strictEqual(response.status, 403)
        assert.deepStrictEqual(yield* body(response), { ok: false, error: 'CsrfRejected' })
      }
      assert.deepStrictEqual(yield* handled, [])
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('rate limit runs before the SDK: the third sign-in for one address is 429 with Retry-After', () =>
    Effect.gen(function* () {
      const attempt = (email: string) => run(json('/sign-in/email', { email, password: 'x' }))
      assert.strictEqual((yield* attempt('Ada@example.com')).status, 200)
      assert.strictEqual((yield* attempt(' ada@example.com')).status, 200)
      const limited = yield* attempt('ADA@example.com')
      assert.strictEqual(limited.status, 429)
      assert.strictEqual(limited.headers.get('retry-after'), '60')
      assert.strictEqual((yield* attempt('lin@example.com')).status, 200)
      assert.strictEqual((yield* handled).length, 3, 'the limited request never reached the SDK')
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('password reset and verification email endpoints are limited per address too', () =>
    Effect.gen(function* () {
      const reset = () => run(json('/request-password-reset', { email: 'ada@example.com' }))
      const verify = () => run(json('/send-verification-email', { email: 'ada@example.com' }))
      for (const send of [reset, verify]) {
        for (let i = 0; i < AppConfig.defaultRateLimits.passwordReset.target.limit; i++) assert.strictEqual((yield* send()).status, 200)
        assert.strictEqual((yield* send()).status, 429)
      }
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('fails closed when counters are unreachable: 503 and the SDK does not run', () => {
    const down = Layer.mergeAll(authMemory, unavailable, TurnstileTest, config).pipe(Layer.provideMerge(config))
    return Effect.gen(function* () {
      const response = yield* run(json('/sign-in/email', { email: 'ada@example.com', password: 'x' }), down as never)
      assert.strictEqual(response.status, 503)
      assert.deepStrictEqual(yield* handled, [])
    }).pipe(Effect.provide(down))
  })

  it.effect('requests without a usable email are 400 on email endpoints', () =>
    Effect.gen(function* () {
      for (const bad of [{}, { email: 5 }, { email: 'x'.repeat(300) }]) {
        assert.strictEqual((yield* run(json('/sign-in/email', bad))).status, 400)
      }
      const malformed = new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{nope' })
      assert.strictEqual((yield* run(malformed)).status, 400)
      const big = new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'a@b.test', pad: 'x'.repeat(20_000) }) })
      assert.strictEqual((yield* run(big)).status, 400)
      assert.deepStrictEqual(yield* handled, [])
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('sign-up needs a valid Turnstile token (action signup)', () => {
    const signUp = (headers: Record<string, string>, email = 'ada@example.com') => run(json('/sign-up/email', { email, password: 'long-enough-1', name: 'Ada' }, headers))
    return Effect.gen(function* () {
      assert.strictEqual((yield* signUp({}, 'a@example.com')).status, 403, 'no token')
      assert.strictEqual((yield* signUp({ [TURNSTILE_HEADER]: 'fail' }, 'b@example.com')).status, 403, 'rejected token')
      assert.deepStrictEqual(yield* handled, [])
      assert.strictEqual((yield* signUp(signUpHeaders, 'new@example.com')).status, 200)
      assert.deepStrictEqual(yield* handled, ['POST /api/auth/sign-up/email'])
    }).pipe(Effect.provide(baseLayer))
  })

  it.effect('sign-up hits the rate limit first: a limited address never costs a Turnstile call', () => {
    let calls = 0
    const counting = Layer.succeed(Turnstile, Turnstile.of({ verify: () => Effect.sync(() => void calls++) }))
    const layer = Layer.mergeAll(authMemory, rateLimitMemory, counting, config).pipe(Layer.provideMerge(config))
    return Effect.gen(function* () {
      const attempt = () => run(json('/sign-up/email', { email: 'ada@example.com', password: 'long-enough-1', name: 'Ada' }, signUpHeaders), layer as never)
      assert.strictEqual((yield* attempt()).status, 200)
      assert.strictEqual((yield* attempt()).status, 429)
      assert.strictEqual(calls, 1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('social sign-in is Google redirect only: idToken, other providers and absolute redirects are 400', () =>
    Effect.gen(function* () {
      const bad = [
        { provider: 'google', idToken: { token: 'x' } },
        { provider: 'github' },
        { provider: 'google', callbackURL: 'https://evil.test/' },
        { provider: 'google', callbackURL: '//evil.test' },
        { provider: 'google', callbackURL: '/\\evil.test' },
        { provider: 'google', requestSignUp: true },
        { provider: 'google', scopes: ['https://www.googleapis.com/auth/drive'] },
        { provider: 'google', loginHint: 'x@y.test' },
        {},
      ]
      for (const payload of bad) assert.strictEqual((yield* run(json('/sign-in/social', payload))).status, 400, JSON.stringify(payload))
      assert.deepStrictEqual(yield* handled, [])
      assert.strictEqual((yield* run(json('/sign-in/social', { provider: 'google', callbackURL: '/app', errorCallbackURL: '/sign-in', disableRedirect: true }))).status, 200)
    }).pipe(Effect.provide(baseLayer)),
  )

  it.effect('keeps several Set-Cookie headers and the status of the SDK response', () => {
    const cookies = Layer.succeed(
      Auth,
      Auth.of({
        handleIdentityRequest: () =>
          Effect.sync(() => {
            const headers = new Headers({ location: '/app' })
            headers.append('set-cookie', 'a=1; HttpOnly')
            headers.append('set-cookie', 'b=2; HttpOnly')
            return new Response(null, { status: 302, headers })
          }),
        readSession: () => Effect.die('unused'),
        setActiveWorkspace: () => Effect.die('unused'),
      }),
    )
    const layer = Layer.mergeAll(cookies, rateLimitMemory, TurnstileTest, config).pipe(Layer.provideMerge(config))
    return Effect.gen(function* () {
      const response = yield* run(new Request(`${ORIGIN}/api/auth/callback/google?code=c&state=s`), layer as never)
      assert.strictEqual(response.status, 302)
      assert.strictEqual(response.headers.get('location'), '/app')
      assert.deepStrictEqual(response.headers.getSetCookie(), ['a=1; HttpOnly', 'b=2; HttpOnly'])
      assert.strictEqual(response.headers.get('cache-control'), 'private, no-store')
    })
  })

  it.effect('an SDK failure is a fixed 500 that does not echo the cause', () => {
    const crashing = Layer.succeed(
      Auth,
      Auth.of({
        handleIdentityRequest: () => Effect.fail(new AuthError({ operation: 'handler', cause: new Error('secret-in-cause') })),
        readSession: () => Effect.die('unused'),
        setActiveWorkspace: () => Effect.die('unused'),
      }),
    )
    const layer = Layer.mergeAll(crashing, rateLimitMemory, TurnstileTest, config).pipe(Layer.provideMerge(config))
    return Effect.gen(function* () {
      const response = yield* run(new Request(`${ORIGIN}/api/auth/get-session`), layer as never)
      assert.strictEqual(response.status, 500)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: 'AuthError' })
    })
  })
})
