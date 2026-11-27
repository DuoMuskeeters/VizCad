import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as AppConfig from '../services/AppConfig'
import type { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { DbError } from '../errors'
import { Db as DbService } from '../services/Db'
import { seedAuthor, seedPost } from '../testing/blog'
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
      const list = yield* blogListPage('en', 1, l)
      assert.isTrue(list.ok)
      if (list.ok) {
        assert.strictEqual(list.siteOrigin, 'https://viz-cad.com')
        assert.deepStrictEqual(list.data.cards.map((c) => c.slug), ['hello'])
      }
      assert.deepStrictEqual(yield* blogListPage('en', 2, l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* postPage('en', 'nope', l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* postPage('en', 'gone', l), { ok: false, status: 410 })
      assert.deepStrictEqual(yield* postPage('tr', 'hello', l), { ok: false, status: 404 })
      assert.deepStrictEqual(yield* authorPage('en', 'nobody', l), { ok: false, status: 404 })
      assert.isTrue((yield* authorPage('en', 'ada', l)).ok)
    }).pipe(Effect.provide(layer)),
  )

  it.effect('a D1 failure is a 500 (the route keeps it out of the cache)', () =>
    Effect.gen(function* () {
      const failing = Layer.mergeAll(
        Layer.succeed(DbService, DbService.of({ use: () => Effect.fail(new DbError({ cause: new Error('down') })) })),
        AppConfig.test({ siteUrl: new URL('https://viz-cad.com') }),
      )
      assert.deepStrictEqual(yield* postPage('en', 'x', failing), { ok: false, status: 500 })
    }),
  )
})
