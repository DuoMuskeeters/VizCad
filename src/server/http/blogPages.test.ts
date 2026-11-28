import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as AppConfig from '../services/AppConfig'
import type { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { DbError } from '../errors'
import { Db as DbService } from '../services/Db'
import { seedAuthor, seedPost } from '../testing/blog'
import { BLOG_PAGE_MAX, BLOG_SLUG_MAX } from '#/shared/marketingRoutes'
import { authorPage, blogListPage, postPage } from './blogPages'

const layer = Layer.mergeAll(DbMemory.memory, AppConfig.test({ siteUrl: new URL('https://viz-cad.com') }))
const shared = Effect.fnUntraced(function* () {
  return Layer.succeedContext(yield* Effect.context<Db | AppConfig.AppConfig>())
})

describe('blog page results', () => {
  it.effect('the page with the site origin; 404 and 410 as values', () =>
    Effect.gen(function* () {
      yield* seedAuthor('ada')
      yield* seedPost({ id: 'p1', slug: 'hello' })
      yield* seedPost({ id: 'p2', slug: 'gone', status: 'archived' })
      const l = yield* shared()
      const list = yield* blogListPage({ locale: 'en', page: 1 }, l)
      assert.isTrue(list.ok)
      if (list.ok) {
        assert.strictEqual(list.siteOrigin, 'https://viz-cad.com')
        assert.deepStrictEqual(list.data.cards.map((c) => c.slug), ['hello'])
      }
      assert.deepStrictEqual(yield* blogListPage({ locale: 'en', page: 2 }, l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* postPage({ locale: 'en', slug: 'nope' }, l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* postPage({ locale: 'en', slug: 'gone' }, l), { ok: false, status: 410 })
      assert.deepStrictEqual(yield* postPage({ locale: 'tr', slug: 'hello' }, l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* authorPage({ locale: 'en', slug: 'nobody' }, l), { ok: false, status: 404 })
      assert.isTrue((yield* authorPage({ locale: 'en', slug: 'ada' }, l)).ok)
    }).pipe(Effect.provide(layer)),
  )

  it.effect('hostile input is a 404 without a D1 read: page past BLOG_PAGE_MAX, long slug, wrong shape', () =>
    Effect.gen(function* () {
      // Every Db call fails: a 404 here proves the input was rejected before any read.
      const noDb = Layer.mergeAll(
        Layer.succeed(DbService, DbService.of({ use: () => Effect.fail(new DbError({ cause: new Error('must not read') })) })),
        AppConfig.test({ siteUrl: new URL('https://viz-cad.com') }),
      )
      const notFound = { ok: false, status: 404 } as const
      for (const page of [BLOG_PAGE_MAX + 1, 99_999, 0, 1.5, Number.NaN, '2']) assert.deepStrictEqual(yield* blogListPage({ locale: 'en', page }, noDb), notFound)
      assert.deepStrictEqual(yield* postPage({ locale: 'en', slug: 'x'.repeat(BLOG_SLUG_MAX + 1) }, noDb), notFound)
      assert.deepStrictEqual(yield* authorPage({ locale: 'en', slug: 'x'.repeat(BLOG_SLUG_MAX + 1) }, noDb), notFound)
      assert.deepStrictEqual(yield* postPage({ locale: 'xx', slug: 'a' }, noDb), notFound)
      assert.deepStrictEqual(yield* postPage({ locale: 'en', slug: '' }, noDb), notFound)
      assert.deepStrictEqual(yield* postPage(null, noDb), notFound)
      // In range, the read happens (and fails here: 500).
      assert.deepStrictEqual(yield* blogListPage({ locale: 'en', page: BLOG_PAGE_MAX }, noDb), { ok: false, status: 500 })
    }),
  )

  it.effect('a long legacy slug (over 200 characters) still opens', () =>
    Effect.gen(function* () {
      const slug = `legacy-${'long-'.repeat(48)}post`
      yield* seedAuthor('ada')
      yield* seedPost({ id: 'p1', slug, title: 'A legacy post with a long slug' })
      const result = yield* postPage({ locale: 'en', slug }, yield* shared())
      assert.isTrue(result.ok && result.data.kind === 'post')
    }).pipe(Effect.provide(layer)),
  )

  it.effect('a D1 failure is a 500 (the route keeps it out of the cache)', () =>
    Effect.gen(function* () {
      const failing = Layer.mergeAll(
        Layer.succeed(DbService, DbService.of({ use: () => Effect.fail(new DbError({ cause: new Error('down') })) })),
        AppConfig.test({ siteUrl: new URL('https://viz-cad.com') }),
      )
      assert.deepStrictEqual(yield* postPage({ locale: 'en', slug: 'x' }, failing), { ok: false, status: 500 })
    }),
  )
})
