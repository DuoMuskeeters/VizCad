import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ConfigError, DbError } from '../errors'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { healthResponse } from './health'

const meta = { requestId: 'ray-1' }
const json = (r: Response) => Effect.promise(() => r.json())

describe('GET /api/health', () => {
  it.effect('200 {"ok":true} when D1 answers', () =>
    Effect.gen(function* () {
      const response = yield* healthResponse(DbMemory.memory, meta)
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* json(response), { ok: true })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )

  it.effect.each([
    { name: 'D1 query fails', db: Layer.succeed(Db, Db.of({ use: () => Effect.fail(new DbError({ cause: 'D1_ERROR: select 1' })) })) },
    { name: 'config is missing', db: Layer.effect(Db, Effect.fail(new ConfigError({ message: 'no binding' }))) },
  ])('fixed 503 {"ok":false} when $name', ({ db }) =>
    Effect.gen(function* () {
      const response = yield* healthResponse(db, meta)
      assert.strictEqual(response.status, 503)
      assert.deepStrictEqual(yield* json(response), { ok: false })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )
})
