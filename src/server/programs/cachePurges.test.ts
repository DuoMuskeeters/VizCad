import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { affectedUrls } from '../cms/affectedUrls'
import { CacheError } from '../errors'
import * as AppConfig from '../services/AppConfig'
import { CacheErrorReason, CachePurges, memoryWith, type MemoryOptions, type PurgeCall } from '../services/Cache'
import * as DbMemory from '../services/Db.memory'
import { programLayer, rows, T0 } from '../testing/fixtures'
import { toUnixSeconds } from '../time'
import { DRAIN_MAX_CALLS, drainCachePurges, enqueuePurges, LATE_PURGE_SECONDS, MAX_ATTEMPTS, PUBLISH_MAX_CALLS, RETRY_SECONDS } from './cachePurges'
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
})

describe('drainCachePurges', () => {
  it.effect('without purge config (K5 open): skips with a reason, makes no call and leaves the queue as it is', () =>
    within({ configured: false })(Effect.gen(function* () {
      yield* enqueue({ urls: urls(3) })
      const summary = yield* drainCachePurges()
      assert.deepStrictEqual(summary, { skipped: 'not-configured', done: 0, failed: 0, queued: 6, calls: 0 })
      assert.deepStrictEqual(yield* calls, [])
      assert.isTrue((yield* rows('cachePurges')).every((r) => r.attempts === 0))
    })),
  )

  it.effect('purges due rows (100 URLs per call), deletes them, keeps the +60 s rows until they are due', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(12) })
      assert.deepStrictEqual(yield* drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS }), { done: 12, failed: 0, queued: 12, calls: 1 })
      assert.deepStrictEqual(urlCount(yield* calls), [12])
      yield* TestClock.adjust(`${LATE_PURGE_SECONDS} seconds`)
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 12, failed: 0, queued: 0, calls: 1 })
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
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 4, failed: 0, queued: 0, calls: 1 })
      assert.deepStrictEqual(yield* calls, [{ kind: 'url', urls: urls(2) }])
    })),
  )

  it.effect('a due host row goes first and covers every due URL row without its own call', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: urls(5) })
      yield* enqueue({ urls: [], host: true })
      assert.deepStrictEqual(yield* drainCachePurges(), { done: 6, failed: 0, queued: 6, calls: 1 })
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

  it.effect('a URL on another host (queued under an old siteUrl) fails and backs off instead of being sent', () =>
    within()(Effect.gen(function* () {
      yield* enqueue({ urls: ['https://viz-cad.com/blog'] })
      const summary = yield* drainCachePurges()
      assert.strictEqual(summary.failed, 1)
      assert.deepStrictEqual(yield* calls, [])
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
