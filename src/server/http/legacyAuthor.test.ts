import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { seedAuthor, seedPost } from '../testing/blog'
import { legacyAuthorResponse } from './legacyAuthor'

const go = (path: string) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Db>()
    const response = yield* legacyAuthorResponse(new Request(`https://viz-cad.com${path}`), Layer.succeedContext(context), { requestId: null })
    return { status: response.status, location: response.headers.get('location'), cache: response.headers.get('cache-control') }
  })

describe('/author/{userId} (docs/12 §6.9)', () => {
  it.effect('an author with a slug and a public post → their page; otherwise → /blog; never the user id', () =>
    Effect.gen(function* () {
      yield* seedAuthor('ada')
      yield* seedAuthor('bob', { slug: null })
      yield* seedAuthor('cat')
      yield* seedPost({ id: 'p1', slug: 'one', authorId: 'ada' })
      yield* seedPost({ id: 'p2', slug: 'two', authorId: 'bob' })
      yield* seedPost({ id: 'p3', slug: 'three', authorId: 'cat', status: 'draft' })
      assert.deepStrictEqual(yield* go('/author/ada'), { status: 301, location: 'https://viz-cad.com/authors/ada', cache: 'private, no-store' })
      assert.strictEqual((yield* go('/author/bob')).location, 'https://viz-cad.com/blog')
      assert.strictEqual((yield* go('/author/cat')).location, 'https://viz-cad.com/blog')
      assert.strictEqual((yield* go('/author/nobody')).location, 'https://viz-cad.com/blog')
      assert.strictEqual((yield* go('/author/a%2Fb')).location, 'https://viz-cad.com/blog')
    }).pipe(Effect.provide(DbMemory.memory)),
  )
})
