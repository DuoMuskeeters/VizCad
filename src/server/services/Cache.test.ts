import { assert, describe, it, layer } from '@effect/vitest'
import { Effect, Layer, Option, Redacted, Ref } from 'effect'
import * as AppConfig from './AppConfig'
import { Cache, CachePurges, memory } from './Cache'
import { type CacheBinding, make } from './Cache.live'

const page = (body: string) => new Response(body, { headers: { 'content-type': 'text/html', 'cache-control': 's-maxage=3600' } })
const text = (r: Option.Option<Response>) => Effect.promise(() => Option.getOrThrow(r).text())

/** Fake Cache API keyed by URL; `broken` makes every call reject. */
const fakeCache = (broken = false) => {
  const store = new Map<string, Response>()
  const deleted: Array<string> = []
  const fail = () => Promise.reject(new Error('cache down'))
  const binding: CacheBinding = {
    match: (req) => (broken ? fail() : Promise.resolve(store.get(req.url)?.clone())),
    put: (req, res) => (broken ? fail() : Promise.resolve(void store.set(req.url, res))),
    delete: (req) => {
      deleted.push(req.url)
      return broken ? fail() : Promise.resolve(store.delete(req.url))
    },
  }
  return { binding, deleted }
}

/** Fake Cloudflare API: records purge bodies and answers with `reply`. */
const fakeApi = (reply: unknown = { success: true, errors: [] }) => {
  const bodies: Array<{ files: Array<string> }> = []
  const headers: Array<Headers> = []
  const fetchFn: typeof fetch = (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    headers.push(new Headers(init?.headers))
    return Promise.resolve(Response.json(reply))
  }
  return { fetchFn, bodies, headers }
}

const zone = { cachePurge: Option.some({ zoneId: 'zone1', token: Redacted.make('purge-token') }) }

describe('Cache.live', () => {
  it.effect('stores and serves pages through the Cache API', () => {
    const cache = fakeCache()
    return Effect.gen(function* () {
      const c = yield* Cache
      assert.isTrue(Option.isNone(yield* c.match('https://viz-cad.com/')))
      yield* c.put('https://viz-cad.com/', page('<h1>Home</h1>'))
      assert.strictEqual(yield* text(yield* c.match('https://viz-cad.com/')), '<h1>Home</h1>')
    }).pipe(Effect.provide(make(cache.binding, fakeApi().fetchFn).pipe(Layer.provide(AppConfig.test()))))
  })

  it.effect('a broken cache degrades to a miss instead of failing the page', () =>
    Effect.gen(function* () {
      const c = yield* Cache
      yield* c.put('https://viz-cad.com/', page('x'))
      assert.isTrue(Option.isNone(yield* c.match('https://viz-cad.com/')))
    }).pipe(Effect.provide(make(fakeCache(true).binding, fakeApi().fetchFn).pipe(Layer.provide(AppConfig.test())))),
  )

  it.effect('without zone config, purge clears only the local cache', () => {
    const cache = fakeCache()
    const api = fakeApi()
    return Effect.gen(function* () {
      const c = yield* Cache
      yield* c.put('https://viz-cad.com/blog', page('old'))
      yield* c.purge(['https://viz-cad.com/blog'])
      assert.isTrue(Option.isNone(yield* c.match('https://viz-cad.com/blog')))
      assert.strictEqual(api.bodies.length, 0)
    }).pipe(Effect.provide(make(cache.binding, api.fetchFn).pipe(Layer.provide(AppConfig.test()))))
  })

  it.effect('with zone config, purges every data center in batches of 30', () => {
    const cache = fakeCache()
    const api = fakeApi()
    const urls = Array.from({ length: 65 }, (_, i) => `https://viz-cad.com/blog/post-${i}`)
    return Effect.gen(function* () {
      yield* (yield* Cache).purge(urls)
      assert.deepStrictEqual(
        api.bodies.map((b) => b.files.length),
        [30, 30, 5],
      )
      assert.deepStrictEqual(api.bodies.flatMap((b) => b.files), urls)
      assert.strictEqual(api.headers[0]?.get('authorization'), 'Bearer purge-token')
      assert.strictEqual(cache.deleted.length, 65)
    }).pipe(Effect.provide(make(cache.binding, api.fetchFn).pipe(Layer.provide(AppConfig.test(zone)))))
  })

  it.effect('a rejected purge fails with CacheError carrying the API message', () =>
    Effect.gen(function* () {
      const error = yield* (yield* Cache).purge(['https://viz-cad.com/']).pipe(Effect.flip)
      assert.strictEqual(error.reason, 'Authentication error')
    }).pipe(
      Effect.provide(
        make(fakeCache().binding, fakeApi({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }).fetchFn).pipe(
          Layer.provide(AppConfig.test(zone)),
        ),
      ),
    ),
  )
})

layer(memory)('Cache (in-memory)', (it) => {
  it.effect('serves stored pages repeatedly and records purges', () =>
    Effect.gen(function* () {
      const c = yield* Cache
      yield* c.put('https://viz-cad.com/', page('<h1>Home</h1>'))
      const hit = yield* c.match('https://viz-cad.com/')
      assert.strictEqual(Option.getOrThrow(hit).headers.get('cache-control'), 's-maxage=3600')
      assert.strictEqual(yield* text(hit), '<h1>Home</h1>')
      assert.strictEqual(yield* text(yield* c.match('https://viz-cad.com/')), '<h1>Home</h1>')

      yield* c.purge(['https://viz-cad.com/'])
      assert.isTrue(Option.isNone(yield* c.match('https://viz-cad.com/')))
      assert.deepStrictEqual(yield* Ref.get(yield* CachePurges), [['https://viz-cad.com/']])
    }),
  )
})
