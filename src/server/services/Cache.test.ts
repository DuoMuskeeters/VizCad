import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Option, Redacted, Ref } from 'effect'
import { CacheError } from '../errors'
import * as AppConfig from './AppConfig'
import { Cache, CacheErrorReason, CachePurges, memory, memoryWith } from './Cache'
import { make } from './Cache.live'

const site = { siteUrl: new URL('https://viz-cad.com') }
const zone = { ...site, cachePurge: Option.some({ zoneId: 'zone1', token: Redacted.make('purge-token') }) }

/** Fake Cloudflare API: records request bodies and answers with `reply` (or a status). */
const fakeApi = (reply: unknown = { success: true, errors: [] }, status = 200) => {
  const bodies: Array<{ files?: Array<string>; hosts?: Array<string>; purge_everything?: boolean }> = []
  const headers: Array<Headers> = []
  const urls: Array<string> = []
  const fetchFn: typeof fetch = (input, init) => {
    urls.push(String(input))
    bodies.push(JSON.parse(String(init?.body)))
    headers.push(new Headers(init?.headers))
    return Promise.resolve(Response.json(reply, { status }))
  }
  return { fetchFn, bodies, headers, urls }
}

const live = (api: ReturnType<typeof fakeApi>, config: Partial<AppConfig.AppConfig['Service']> = zone) =>
  make(api.fetchFn, 'b1.x').pipe(Layer.provide(AppConfig.test(config)))

describe('Cache.live', () => {
  it.effect('without zone config every purge fails with CacheError and nothing is sent (K5 open: no token yet)', () => {
    const api = fakeApi()
    return Effect.gen(function* () {
      const cache = yield* Cache
      assert.isFalse(cache.configured)
      assert.strictEqual((yield* cache.purge(['https://viz-cad.com/blog']).pipe(Effect.flip)).reason, CacheErrorReason.notConfigured)
      assert.strictEqual((yield* cache.purgeHost('viz-cad.com').pipe(Effect.flip)).reason, CacheErrorReason.notConfigured)
      assert.strictEqual(api.bodies.length, 0)
    }).pipe(Effect.provide(live(api, site)))
  })

  it.effect('purges by URL in batches of 100, with the build key suffix, and never purges everything', () => {
    const api = fakeApi()
    const urls = Array.from({ length: 205 }, (_, i) => `https://viz-cad.com/blog/post-${i}`)
    return Effect.gen(function* () {
      yield* (yield* Cache).purge(urls)
      assert.deepStrictEqual(api.bodies.map((b) => b.files?.length), [100, 100, 5])
      assert.deepStrictEqual(api.bodies.flatMap((b) => b.files ?? []), urls.map((u) => `${u}?v=b1.x`))
      assert.isTrue(api.bodies.every((b) => b.purge_everything === undefined && b.hosts === undefined))
      assert.strictEqual(api.urls[0], 'https://api.cloudflare.com/client/v4/zones/zone1/purge_cache')
      assert.strictEqual(api.headers[0]?.get('authorization'), 'Bearer purge-token')
    }).pipe(Effect.provide(live(api)))
  })

  it.effect('purges the site hostname in one call', () => {
    const api = fakeApi()
    return Effect.gen(function* () {
      yield* (yield* Cache).purgeHost('viz-cad.com')
      assert.deepStrictEqual(api.bodies, [{ hosts: ['viz-cad.com'] }])
    }).pipe(Effect.provide(live(api)))
  })

  it.effect('refuses any other host, URL with a query, or malformed URL before calling the API', () => {
    const api = fakeApi()
    return Effect.gen(function* () {
      const cache = yield* Cache
      for (const bad of [['https://www.viz-cad.com/'], ['https://vizcad-rewrite.example.workers.dev/'], ['http://viz-cad.com/'], ['https://viz-cad.com/blog?x=1'], ['not a url'], ['https://viz-cad.com/', 'https://evil.test/']]) {
        assert.strictEqual((yield* cache.purge(bad).pipe(Effect.flip)).reason, CacheErrorReason.foreignHost, bad.join())
      }
      for (const host of ['www.viz-cad.com', 'staging.viz-cad.com', 'evil.test']) {
        assert.strictEqual((yield* cache.purgeHost(host).pipe(Effect.flip)).reason, CacheErrorReason.foreignHost, host)
      }
      assert.strictEqual(api.bodies.length, 0)
    }).pipe(Effect.provide(live(api)))
  })

  it.effect('staging config never purges production URLs (the token is zone-wide; only the host check stops it)', () => {
    const api = fakeApi()
    return Effect.gen(function* () {
      const cache = yield* Cache
      assert.strictEqual((yield* cache.purge(['https://viz-cad.com/blog']).pipe(Effect.flip)).reason, CacheErrorReason.foreignHost)
      assert.strictEqual((yield* cache.purgeHost('viz-cad.com').pipe(Effect.flip)).reason, CacheErrorReason.foreignHost)
      yield* cache.purge(['https://staging.viz-cad.com/blog'])
      assert.deepStrictEqual(api.bodies, [{ files: ['https://staging.viz-cad.com/blog?v=b1.x'] }])
    }).pipe(Effect.provide(live(api, { ...zone, siteUrl: new URL('https://staging.viz-cad.com') })))
  })

  it.effect('HTTP 429 is CacheError rate-limited; a rejected purge carries the API message', () =>
    Effect.gen(function* () {
      const limited = yield* Cache.use((c) => c.purgeHost('viz-cad.com')).pipe(Effect.flip, Effect.provide(live(fakeApi({ success: false }, 429))))
      assert.strictEqual(limited.reason, CacheErrorReason.rateLimited)
      const rejected = yield* Cache.use((c) => c.purge(['https://viz-cad.com/'])).pipe(
        Effect.flip,
        Effect.provide(live(fakeApi({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 403))),
      )
      assert.strictEqual(rejected.reason, 'Authentication error')
      const malformed = yield* Cache.use((c) => c.purge(['https://viz-cad.com/'])).pipe(Effect.flip, Effect.provide(live(fakeApi('<html>'))))
      assert.strictEqual(malformed.reason, 'purge-malformed-response')
    }),
  )
})

describe('Cache (in-memory)', () => {
  it.effect('records each would-be API call and validates like the live layer', () =>
    Effect.gen(function* () {
      const cache = yield* Cache
      assert.isTrue(cache.configured)
      yield* cache.purge(Array.from({ length: 150 }, (_, i) => `https://vizcad.test/p${i}`))
      yield* cache.purgeHost('vizcad.test')
      assert.strictEqual((yield* cache.purge(['https://other.test/']).pipe(Effect.flip)).reason, CacheErrorReason.foreignHost)
      const calls = yield* Ref.get(yield* CachePurges)
      assert.deepStrictEqual(calls.map((c) => (c.kind === 'url' ? c.urls.length : c.hostname)), [100, 50, 'vizcad.test'])
    }).pipe(Effect.provide(memory.pipe(Layer.provide(AppConfig.test())))),
  )

  it.effect('memoryWith: unconfigured, or failing chosen calls', () =>
    Effect.gen(function* () {
      const off = yield* Cache.use((c) => c.purge(['https://vizcad.test/'])).pipe(Effect.flip, Effect.provide(memoryWith({ configured: false }).pipe(Layer.provide(AppConfig.test()))))
      assert.strictEqual(off.reason, CacheErrorReason.notConfigured)
      const failing = memoryWith({ fail: (call) => (call.kind === 'host' ? new CacheError({ reason: CacheErrorReason.rateLimited }) : undefined) })
      yield* Effect.gen(function* () {
        const cache = yield* Cache
        yield* cache.purge(['https://vizcad.test/'])
        assert.strictEqual((yield* cache.purgeHost('vizcad.test').pipe(Effect.flip)).reason, CacheErrorReason.rateLimited)
      }).pipe(Effect.provide(failing.pipe(Layer.provide(AppConfig.test()))))
    }),
  )
})
