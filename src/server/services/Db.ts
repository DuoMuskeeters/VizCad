import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { Context, Effect } from 'effect'
import * as schema from '../db/schema'
import { DbError } from '../errors'

export type Database = DrizzleD1Database<typeof schema>

/**
 * D1 through Drizzle. `use` runs one query (or one `db.batch([...])`) and turns rejections into DbError.
 * D1 has no interactive transactions: never call `db.transaction`, group writes with `db.batch` (atomic).
 * Live layer: Db.live.ts. Test layer: Db.memory.ts (SQLite in memory with every migration in drizzle/).
 */
export class Db extends Context.Service<
  Db,
  {
    readonly use: <A>(query: (db: Database) => Promise<A>) => Effect.Effect<A, DbError>
  }
>()('vizcad/Db') {}

/** Wraps any D1-compatible database. Shared by the live and in-memory layers so both run the same driver. */
export const make = (d1: D1Database) => {
  const db = drizzle(d1, { schema })
  return Db.of({
    use: (query) => Effect.tryPromise({ try: () => query(db), catch: (cause) => new DbError({ cause }) }),
  })
}
