import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Logger, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { affectedUrls } from '../cms/affectedUrls'
import { CacheError } from '../errors'
import * as AppConfig from '../services/AppConfig'
import { Cache, CacheErrorReason, CachePurges, memoryWith, type MemoryOptions, type PurgeCall } from '../services/Cache'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { programLayer, rows, T0 } from '../testing/fixtures'
import { toUnixSeconds } from '../time'
import { D1_MAX_PARAMS, DRAIN_MAX_CALLS, drainCachePurges, enqueuePurges, INSERT_ROWS_PER_STATEMENT, LATE_PURGE_SECONDS, MAX_ATTEMPTS, PUBLISH_MAX_CALLS, RETRY_SECONDS } from './cachePurges'
import { DAILY, HOURLY, PURGE, runCron } from './cron'
import { runBatch } from './shared'

const site = new URL('https://vizcad.test')
const urls = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `https://vizcad.test/blog/${prefix}${i}`)

const layer = (cache: MemoryOptions = {}) =>
  Layer.mergeAll(DbMemory.memory, memoryWith(cache)).pipe(Layer.provideMerge(AppConfig.test({ siteUrl: site })))

const within = (cache: MemoryOptions = {}) => <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(layer(cache)))

const enqueue = (targets: { urls: ReadonlyArray<string>; host?: boolean }, now = T0) =>
  runBatch((d) => enqueuePurges(d, { targets: { urls: targets.urls, host: targets.host ?? false }, hostname: site.hostname, reason: 'test', now }))

const calls = CachePurges.use(Ref.get)
const urlCount = (all: ReadonlyArray<PurgeCall>) => all.map((c) => (c.kind === 'url' ? c.urls.length : 'host'))

describe('enqueuePurges', () => {
  it.effect('writes every target twice (now and +60 s); queueing the same targets again keeps one row each', () =>
    within()(Effect.gen(function* () {
      const targets = affectedUrls(site, { kind: 'legal', legalKind: 'terms', locale: 'en' })
      yield* enqueue(targets)
      yield* enqueue(targets)
      const queued = yield* rows('cachePurges')
      assert.strictEqual(queued.length, targets.urls.length * 2)
      assert.deepStrictEqual([...new Set(queued.map((r) => toUnixSeconds(r.notBefore)))].sort(), [T0, T0 + LATE_PURGE_SECONDS])
      assert.isTrue(queued.every((r) => r.kind === 'url' && r.attempts === 0 && r.lastError === null && r.reason === 'test'))
    })),
  )

  it.effect('a host change is one host row per moment; long URL lists are split under the D1 parameter limit', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: [], host: true })
      yield* enqueue({ urls: urls(150) })
      const queued = yield* rows('cachePurges')
      assert.deepStrictEqual(queued.filter((r) => r.kind === 'host').map((r) => r.target), ['vizcad.test', 'vizcad.test'])
      assert.strictEqual(queued.filter((r) => r.kind === 'url').length, 300)
    })),
  )

  it.effect('every insert statement binds at most 100 parameters (D1 limit), the largest chunk included', () =>
    within()(Effect.gen(function* () {
      const db = yield* Db
      const statements = yield* db.use(async (d) =>
        enqueuePurges(d, { targets: { urls: urls(150), host: true }, hostname: site.hostname, reason: 'a'.repeat(50), now: T0 }),
      )
      const params = statements.map((s) => s.toSQL().params.length)
      assert.strictEqual(Math.max(...params), INSERT_ROWS_PER_STATEMENT * 6)
      assert.isTrue(params.every((n) => n <= D1_MAX_PARAMS))
    })),
  )
})

describe('drainCachePurges', () => {
  it.effect('without purge config (K5 open): skips with a reason, makes no call and leaves the queue as it is; warns only when rows wait', () =>
    within({ configured: false })(Effect.gen(function* () {
      const warnings: Array<string> = []
      const logger = Logger.make(({ message }) => void warnings.push(JSON.stringify(message)))
      const drain = drainCachePurges().pipe(Effect.provide(Logger.layer([logger])))
      assert.deepStrictEqual(yield* drain, { skipped: 'not-configured', done: 0, failed: 0, dropped: 0, queued: 0, calls: 0 })
      assert.deepStrictEqual(warnings, [])
      yield* enqueue({ urls: urls(3) })
      yield* drain
      assert.strictEqual(warnings.length, 1)
      assert.include(warnings[0], 'cache purge skipped')
      const summary = yield* drainCachePurges()
      assert.deepStrictEqual(summary, { skipped: 'not-configured', done: 0, failed: 0, dropped: 0, queued: 6, calls: 0 })
      assert.deepStrictEqual(yield* calls, [])
      assert.isTrue((yield* rows('cachePurges')).every((r) => r.attempts === 0))
    })),
  )

  it.effect('purges due rows (100 URLs per call), deletes them, keeps the +60 s rows until they are due', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(12) })
      assert.deepStrictEqual(yield* drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS }), { done: 12, failed: 0, dropped: 0, queued: 12, calls: 1 })
      assert.deepStrictEqual(urlCount(yield* calls), [12])
      yield* TestClock.adjust(`${LATE_PURGE_SECONDS} seconds`)
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 12, failed: 0, dropped: 0, queued: 0, calls: 1 })
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })),
  )

  it.effect('the publish request makes at most 2 API calls, the cron at most 3 (300 URLs); the rest waits', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(450) })
      const publish = yield* drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS })
      assert.strictEqual(publish.calls, 2)
      assert.strictEqual(publish.done, 200)
      const cron = yield* drainCachePurges({ maxCalls: DRAIN_MAX_CALLS })
      assert.strictEqual(cron.calls, 3)
      assert.strictEqual(cron.done, 250)
      assert.deepStrictEqual(urlCount(yield* calls), [100, 100, 100, 100, 50])
      assert.isTrue((yield* calls).every((c) => c.kind !== 'url' || c.urls.length <= 100))
    })),
  )

  it.effect('a target due twice (the cron ran late) is sent once and both rows go', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(2) }, T0 - 120)
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 4, failed: 0, dropped: 0, queued: 0, calls: 1 })
      assert.deepStrictEqual(yield* calls, [{ kind: 'url', urls: urls(2) }])
    })),
  )

  it.effect('a due host row goes first and covers every due URL row without its own call', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(5) })
      yield* enqueue({ urls: [], host: true })
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 6, failed: 0, dropped: 0, queued: 6, calls: 1 })
      assert.deepStrictEqual(yield* calls, [{ kind: 'host', hostname: 'vizcad.test' }])
    })),
  )

  it.effect('hostname 429: the row stays, attempts + 1, notBefore moves 60 s; URL rows still go out', () =>
    within({ fail: (c) => (c.kind === 'host' ? new CacheError({ reason: CacheErrorReason.rateLimited }) : undefined) })(Effect.gen(function* () {
      yield* enqueue({ urls: [], host: true })
      yield* enqueue({ urls: urls(1) })
      const summary = yield* drainCachePurges()
      assert.strictEqual(summary.failed, 1)
      assert.strictEqual(summary.done, 1)
      const host = (yield* rows('cachePurges')).filter((r) => r.kind === 'host' && r.attempts > 0)
      assert.strictEqual(host.length, 1)
      assert.strictEqual(host[0]?.lastError, CacheErrorReason.rateLimited)
      assert.strictEqual(toUnixSeconds(host[0]?.notBefore ?? new Date(0)), T0 + RETRY_SECONDS)
    })),
  )

  it.effect('a failed URL purge keeps the rows; after 10 failures a row is left for a manual retry', () =>
    within({ fail: () => new CacheError({ reason: 'Authentication error' }) })(Effect.gen(function* () {
      yield* enqueue({ urls: urls(1) })
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        yield* drainCachePurges()
        yield* TestClock.adjust(`${RETRY_SECONDS} seconds`)
      }
      const before = (yield* calls).length
      const summary = yield* drainCachePurges()
      assert.strictEqual(summary.calls, 0)
      assert.strictEqual((yield* calls).length, before)
      const stuck = (yield* rows('cachePurges')).filter((r) => r.attempts >= MAX_ATTEMPTS)
      assert.isAbove(stuck.length, 0)
      assert.isTrue(stuck.every((r) => r.lastError === 'Authentication error'))
    })),
  )

  it.effect('a failed target merges into its own +60 s row (one row per target and moment) and carries the failure count', () =>
    within({ fail: () => new CacheError({ reason: 'purge-unreachable' }) })(Effect.gen(function* () {
      yield* enqueue({ urls: urls(1) })
      yield* drainCachePurges()
      const left = yield* rows('cachePurges')
      assert.strictEqual(left.length, 1)
      assert.strictEqual(left[0]?.attempts, 1)
      assert.strictEqual(left[0]?.lastError, 'purge-unreachable')
      assert.strictEqual(toUnixSeconds(left[0]?.notBefore ?? new Date(0)), T0 + LATE_PURGE_SECONDS)
    })),
  )

  it.effect('two overlapping drains that both fail keep the target queued (the second finds the row the first moved)', () =>
    within()(Effect.gen(function* () {
      // Queued a minute ago: both rows are due now and nothing waits at the retry moment yet.
      yield* enqueue({ urls: urls(1) }, T0 - LATE_PURGE_SECONDS)
      const context = yield* Effect.context<Db | AppConfig.AppConfig>()
      let purges = 0
      const failing: Cache['Service'] = {
        configured: true,
        purgeHost: () => Effect.fail(new CacheError({ reason: 'purge-unreachable' })),
        // The first call runs a whole second drain (the cron next to a publish request) before it fails itself.
        purge: () =>
          Effect.gen(function* () {
            if (purges++ === 0) yield* drainCachePurges().pipe(Effect.provideService(Cache, failing), Effect.provideContext(context), Effect.orDie)
            return yield* new CacheError({ reason: 'purge-unreachable' })
          }),
      }
      const summary = yield* drainCachePurges().pipe(Effect.provideService(Cache, failing))
      assert.strictEqual(summary.failed, 2)
      const left = yield* rows('cachePurges')
      assert.deepStrictEqual(left.map((r) => [r.target, toUnixSeconds(r.notBefore), r.attempts, r.lastError]), [
        ['https://vizcad.test/blog/p0', T0 + RETRY_SECONDS, 1, 'purge-unreachable'],
      ])
    })),
  )

  it.effect('rows off the site host (queued under an old siteUrl) are dropped unsent; the site URLs of the batch still go out', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: ['https://viz-cad.com/blog', 'http://vizcad.test/blog', ...urls(2)] })
      yield* runBatch((d) => enqueuePurges(d, { targets: { urls: [], host: true }, hostname: 'viz-cad.com', reason: 'test', now: T0 }))
      const summary = yield* drainCachePurges()
      assert.deepStrictEqual(summary, { done: 2, failed: 0, dropped: 3, queued: 5, calls: 1 })
      assert.deepStrictEqual(yield* calls, [{ kind: 'url', urls: urls(2) }])
      const left = yield* rows('cachePurges')
      assert.isTrue(left.every((r) => toUnixSeconds(r.notBefore) === T0 + LATE_PURGE_SECONDS && r.attempts === 0))
    })),
  )
})

describe('cron', () => {
  it.effect('the purge cron drains the queue; the hourly and daily runs do not touch it', () =>
    TestClock.setTime(T0 * 1000).pipe(Effect.andThen(Effect.gen(function* () {
      yield* enqueue({ urls: urls(3) })
      yield* runCron(HOURLY)
      yield* runCron(DAILY)
      assert.deepStrictEqual(yield* calls, [])
      yield* runCron(PURGE)
      assert.deepStrictEqual(urlCount(yield* calls), [3])
    })), Effect.provide(programLayer())),
  )
})
