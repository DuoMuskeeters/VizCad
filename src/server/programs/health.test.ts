import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as DbMemory from '../services/Db.memory'
import { health } from './health'

describe('health', () => {
  it.effect('reports ok when D1 answers', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* health(), { ok: true })
    }).pipe(Effect.provide(DbMemory.memory)),
  )
})
