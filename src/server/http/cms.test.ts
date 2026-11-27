import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { CacheError } from '../errors'
import { MAX_ATTEMPTS } from '../programs/cachePurges'
import * as AppConfig from '../services/AppConfig'
import * as Auth from '../services/Auth'
import { CachePurges, memoryWith, type MemoryOptions } from '../services/Cache'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import * as RateLimit from '../services/RateLimit'
import { rows, T0 } from '../testing/fixtures'
import { fromUnixSeconds } from '../time'
import { type CmsServices, cmsOperationNames, cmsResponse } from './cms'
import { STATUS } from './respond'

const ORIGIN = 'https://vizcad.test'
const meta = { requestId: 'ray-1' }

const post = (operation: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${ORIGIN}/api/cms/${operation}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'session=tok-admin', 'cf-ray': 'ray-1', 'cf-connecting-ip': '203.0.113.9', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

const session = (userId: string, overrides: Partial<Auth.SessionSummary> = {}): Auth.SessionSummary => ({
  sessionId: `s-${userId}`, userId, name: userId, email: `${userId}@example.com`, emailVerified: true, accountStatus: 'active', platformRole: 'admin', activeWorkspaceId: null, ...overrides,
})

const layer = (cache: MemoryOptions, config: Partial<AppConfig.AppConfig['Service']>) =>
  Layer.mergeAll(DbMemory.memory, Auth.memory, RateLimit.memory, memoryWith(cache)).pipe(Layer.provideMerge(AppConfig.test(config)))

const call = (request: Request) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<CmsServices>()
    const response = yield* cmsResponse(request, Layer.succeedContext(context), meta)
    const body = yield* Effect.promise(() => response.json() as Promise<{ ok: boolean; data?: unknown; error?: string; reason?: string }>)
    return { status: response.status, body, headers: response.headers }
  })

const run = <A, E, R>(body: Effect.Effect<A, E, R>, cache: MemoryOptions = {}, config: Partial<AppConfig.AppConfig['Service']> = {}) =>
  TestClock.setTime(T0 * 1000).pipe(
    Effect.andThen(Effect.gen(function* () {
      const auth = yield* Auth.MemoryAuth
      yield* Ref.update(auth, (s) => ({
        ...s,
        sessions: new Map([
          ['tok-admin', session('admin')],
          ['tok-user', session('user', { platformRole: 'user' })],
          ['tok-unverified', session('unverified', { emailVerified: false })],
          ['tok-suspended', session('suspended', { accountStatus: 'suspended' })],
        ]),
      }))
    })),
    Effect.andThen(body),
    Effect.provide(layer(cache, config)),
  )

const purgeCalls = CachePurges.use(Ref.get)

describe('POST /api/cms/<operation>', () => {
  it('has exactly the operations 6a needs', () => {
    assert.deepStrictEqual([...cmsOperationNames].sort(), ['drainPurges', 'listPurges', 'purgeHost', 'purgeUrls'])
  })

  it.effect('unknown operations (including prototype keys) are 404, before CSRF and session', () =>
    run(Effect.gen(function* () {
      for (const name of ['nope', 'toString', '__proto__', 'hasOwnProperty', 'listPurges/extra', '']) {
        assert.strictEqual((yield* call(post(name, {}, { cookie: '', origin: 'https://evil.test' }))).status, 404, name)
      }
    })))

  it.effect('CSRF: GET, foreign origin, cross-site fetch and form bodies are refused before the session is read', () =>
    run(Effect.gen(function* () {
      for (const [request, label] of [
        [post('listPurges', {}, {}, 'GET'), 'GET'],
        [post('listPurges', {}, { origin: 'https://evil.test' }), 'origin'],
        [post('listPurges', {}, { origin: '' }), 'no origin'],
        [post('listPurges', {}, { 'sec-fetch-site': 'cross-site' }), 'fetch-site'],
        [post('listPurges', {}, { 'content-type': 'text/plain' }), 'content-type'],
      ] as const) {
        const { status, body } = yield* call(request)
        assert.strictEqual(status, 403, label)
        assert.strictEqual(body.error, 'CsrfRejected', label)
      }
    })))

  it.effect('a trusted extra origin passes the CSRF check', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listPurges', {}, { origin: 'http://localhost:5173' }))).status, 200)
    }), {}, { trustedOrigins: new Set([ORIGIN, 'http://localhost:5173']) }))

  it.effect('no session is 401, a suspended account is 401; a non-admin and an unverified admin are 403', () =>
    run(Effect.gen(function* () {
      for (const name of cmsOperationNames) {
        assert.strictEqual((yield* call(post(name, {}, { cookie: '' }))).status, 401, `${name} anonymous`)
        assert.strictEqual((yield* call(post(name, {}, { cookie: 'session=tok-suspended' }))).status, 401, `${name} suspended`)
        const user = yield* call(post(name, {}, { cookie: 'session=tok-user' }))
        assert.strictEqual(user.status, 403, `${name} non-admin`)
        assert.strictEqual(user.body.error, 'PermissionDenied')
        assert.isUndefined(user.body.reason, 'the denial reason stays a server diagnostic')
        assert.strictEqual((yield* call(post(name, {}, { cookie: 'session=tok-unverified' }))).status, 403, `${name} unverified`)
      }
      assert.deepStrictEqual(yield* purgeCalls, [], 'no denied request reached the cache API')
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })))

  it.effect('bodies are schema-checked: extra fields, wrong types, bad JSON and oversized lists are 400', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listPurges', { limit: 0 }))).status, 400)
      assert.strictEqual((yield* call(post('listPurges', { limit: 201 }))).status, 400)
      assert.strictEqual((yield* call(post('listPurges', { extra: 1 }))).status, 400)
      assert.strictEqual((yield* call(post('drainPurges', { force: true }))).status, 400)
      assert.strictEqual((yield* call(post('purgeHost', { hostname: 'viz-cad.com' }))).status, 400, 'no other host can be named')
      assert.strictEqual((yield* call(post('purgeHost', []))).status, 400)
      assert.strictEqual((yield* call(post('purgeHost', null))).status, 400)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: [] }))).status, 400)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: 'https://vizcad.test/' }))).status, 400)
      const many = Array.from({ length: 101 }, (_, i) => `${ORIGIN}/blog/p${i}`)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: many }))).status, 400)
      const bad = new Request(`${ORIGIN}/api/cms/listPurges`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'session=tok-admin' }, body: '{' })
      assert.strictEqual((yield* call(bad)).status, 400)
    })))

  it.effect('listPurges: the queue with counts and the configured flag, private and no-store', () =>
    run(Effect.gen(function* () {
      const db = yield* Db
      yield* db.use((d) =>
        d.insert(schema.cachePurges).values([
          { kind: 'url', target: `${ORIGIN}/`, reason: 'publish', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0 + 60) },
          { kind: 'host', target: 'vizcad.test', reason: 'texts', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0), attempts: MAX_ATTEMPTS, lastError: 'rate-limited' },
        ]),
      )
      const { status, body, headers } = yield* call(post('listPurges', {}))
      assert.strictEqual(status, 200)
      assert.strictEqual(headers.get('cache-control'), 'private, no-store')
      const data = body.data as { configured: boolean; total: number; failed: number; rows: Array<{ kind: string; target: string; notBefore: number; failed: boolean; lastError: string | null }> }
      assert.isTrue(data.configured)
      assert.strictEqual(data.total, 2)
      assert.strictEqual(data.failed, 1)
      assert.deepStrictEqual(data.rows.map((r) => [r.kind, r.notBefore, r.failed, r.lastError]), [['host', T0, true, 'rate-limited'], ['url', T0 + 60, false, null]])
      const limited = yield* call(post('listPurges', { limit: 1 }))
      assert.strictEqual((limited.body.data as { rows: unknown[] }).rows.length, 1)
    })))

  it.effect('purgeUrls queues each URL now and +60 s, purges the due ones in one API call and leaves the late ones queued', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeUrls', { urls: [`${ORIGIN}/`, `${ORIGIN}/blog`, `${ORIGIN}/blog`, `${ORIGIN}/tr`] }))
      assert.strictEqual(status, 200)
      const data = body.data as { urls: number; purge: { done: number; queued: number; calls: number } }
      assert.strictEqual(data.urls, 3)
      assert.deepStrictEqual(data.purge, { done: 3, failed: 0, dropped: 0, queued: 3, calls: 1 } as unknown as typeof data.purge)
      assert.deepStrictEqual(yield* purgeCalls, [{ kind: 'url', urls: [`${ORIGIN}/`, `${ORIGIN}/blog`, `${ORIGIN}/tr`] }])
      // The late purge waits for the drain (admin screen or cron).
      yield* TestClock.adjust('61 seconds')
      const drained = yield* call(post('drainPurges', {}))
      assert.strictEqual(drained.status, 200)
      assert.deepStrictEqual((drained.body.data as { purge: { done: number; queued: number } }).purge, { done: 3, failed: 0, dropped: 0, queued: 0, calls: 1 } as never)
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })))

  it.effect('purgeUrls refuses URLs off the site, with a query, or outside the cached pages, and queues nothing', () =>
    run(Effect.gen(function* () {
      for (const url of ['https://viz-cad.com/', 'http://vizcad.test/', 'https://vizcad.test/?utm=x', 'https://vizcad.test/#a', 'https://vizcad.test/app', 'https://vizcad.test/api/cms/listPurges', '/blog', 'not a url']) {
        const { status, body } = yield* call(post('purgeUrls', { urls: [`${ORIGIN}/blog`, url] }))
        assert.strictEqual(status, 400, url)
        assert.strictEqual(body.error, 'ValidationError', url)
      }
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
      assert.deepStrictEqual(yield* purgeCalls, [])
    })))

  it.effect('purgeHost purges the site hostname only, in one API call', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeHost', {}))
      assert.strictEqual(status, 200)
      assert.strictEqual((body.data as { hostname: string }).hostname, 'vizcad.test')
      assert.deepStrictEqual(yield* purgeCalls, [{ kind: 'host', hostname: 'vizcad.test' }])
      assert.deepStrictEqual((yield* rows('cachePurges')).map((r) => r.kind), ['host'], 'the late +60 s row stays queued')
    })))

  it.effect('a failed purge is reported in the summary and stays queued for the retry', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeHost', {}))
      assert.strictEqual(status, 200)
      const purge = (body.data as { purge: { done: number; failed: number } }).purge
      assert.strictEqual(purge.done, 0)
      assert.strictEqual(purge.failed, 1)
      assert.strictEqual((yield* rows('cachePurges')).length, 1, 'the failed row merged into the +60 s row')
    }), { fail: () => new CacheError({ reason: 'rate-limited' }) }))

  it.effect('without purge config (K5 open) every write is CacheError 502 and nothing is queued; listing still works', () =>
    run(Effect.gen(function* () {
      for (const [name, body] of [['drainPurges', {}], ['purgeHost', {}], ['purgeUrls', { urls: [`${ORIGIN}/`] }]] as const) {
        const response = yield* call(post(name, body))
        assert.strictEqual(response.status, 502, name)
        assert.strictEqual(response.body.error, 'CacheError', name)
      }
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
      const list = yield* call(post('listPurges', {}))
      assert.isFalse((list.body.data as { configured: boolean }).configured)
    }), { configured: false }))

  it.effect('writes are rate limited per admin (cmsWrite); reads are not', () =>
    run(Effect.gen(function* () {
      const statuses = []
      for (let i = 0; i < 3; i++) statuses.push((yield* call(post('drainPurges', {}))).status)
      assert.deepStrictEqual(statuses, [200, 200, 429])
      assert.strictEqual((yield* call(post('listPurges', {}))).status, 200)
    }), {}, { rateLimits: { ...AppConfig.defaultRateLimits, cmsWrite: { target: { limit: 2, windowSeconds: 3600 }, ip: { limit: 100, windowSeconds: 3600 } } } }))

  it('every error the dispatcher can raise has a status', () => {
    for (const tag of ['ValidationError', 'PayloadTooLarge', 'CsrfRejected', 'Unauthenticated', 'PermissionDenied', 'RateLimitExceeded', 'RateLimitError', 'CacheError', 'DbError', 'ConfigError', 'AuthError', 'ResourceUnavailable'] as const) {
      assert.isNumber(STATUS[tag], tag)
    }
  })
})
