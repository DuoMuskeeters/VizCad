import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { openMemoryD1 } from '../testing/memoryD1'
import { healthResponse } from './D1Health'

const json = (r: Response) => Effect.promise(() => r.json())
const fake = (first: () => Promise<{ ok: number } | null>) => ({ prepare: () => ({ first }) }) as unknown as D1Database

describe('GET /api/health', () => {
  it.effect('200 {"ok":true} when D1 answers', () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() => healthResponse(openMemoryD1().binding, 'ray-1'))
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* json(response), { ok: true })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )

  it.effect.each([
    { name: 'D1 query fails', d1: fake(() => Promise.reject(new Error('D1_ERROR: select 1'))) },
    { name: 'D1 answers with something else', d1: fake(() => Promise.resolve(null)) },
  ])('fixed 503 {"ok":false} when $name', ({ d1 }) =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() => healthResponse(d1, null))
      assert.strictEqual(response.status, 503)
      assert.deepStrictEqual(yield* json(response), { ok: false })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )
})
