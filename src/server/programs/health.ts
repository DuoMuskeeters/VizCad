import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { Db } from '../services/Db'

/** Liveness check: proves the Worker can reach D1. Read-only. */
export const health = Effect.fn('health')(function* () {
  const db = yield* Db
  const row = yield* db.use((d) => d.get<{ ok: number }>(sql`select 1 as ok`))
  return { ok: row?.ok === 1 }
})
