import { assert, describe, it, layer } from '@effect/vitest'
import { eq, getTableName, is } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { openMemoryD1 } from '../testing/memoryD1'
import { Db } from './Db'
import * as DbMemory from './Db.memory'

const tables: ReadonlyArray<SQLiteTable> = Object.values(schema).flatMap((t) => (is(t, SQLiteTable) ? [t] : []))

const at = new Date('2026-11-23T10:00:00Z')
const newUser = (id: string, email: string) => ({
  id,
  name: 'Ada',
  email,
  emailVerified: true,
  createdAt: at,
  updatedAt: at,
})

describe('migration history', () => {
  // schema.ts must describe exactly what drizzle/*.sql builds; production was built by those files.
  it('creates every table and column declared in schema.ts, and nothing else', () => {
    const d1 = openMemoryD1()
    const tableRows = d1.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
      .all()
    assert.deepStrictEqual(
      tableRows.map((r) => r['name']),
      tables.map((t) => getTableName(t)).sort(),
    )
    for (const table of tables) {
      const { name, columns } = getTableConfig(table)
      const actual = d1.sqlite.prepare(`pragma table_info('${name}')`).all().map((c) => c['name'])
      assert.deepStrictEqual(actual.sort(), columns.map((c) => c.name).sort(), `columns of ${name}`)
    }
    d1.close()
  })
})

layer(DbMemory.memory)('Db (in-memory D1)', (it) => {
  it.effect('round-trips typed rows (booleans, timestamps, defaults)', () =>
    Effect.gen(function* () {
      const db = yield* Db
      yield* db.use((d) => d.insert(schema.user).values(newUser('u1', 'ada@example.com')))
      const row = yield* db.use((d) => d.query.user.findFirst({ where: eq(schema.user.id, 'u1') }))
      assert.strictEqual(row?.emailVerified, true)
      assert.strictEqual(row?.createdAt.getTime(), at.getTime())
      assert.strictEqual(row?.storageQuotaGb, 5)
      assert.strictEqual(row?.role, 'user')
    }),
  )

  it.effect('turns a constraint violation into DbError', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const error = yield* db
        .use((d) => d.insert(schema.user).values(newUser('u2', 'ada@example.com')))
        .pipe(Effect.flip)
      assert.strictEqual(error._tag, 'DbError')
    }),
  )

  it.effect('batch is atomic, like D1', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const error = yield* db
        .use((d) =>
          d.batch([
            d.insert(schema.user).values(newUser('u3', 'lin@example.com')),
            d.insert(schema.user).values(newUser('u4', 'ada@example.com')), // duplicate email
          ]),
        )
        .pipe(Effect.flip)
      assert.strictEqual(error._tag, 'DbError')
      const u3 = yield* db.use((d) => d.query.user.findFirst({ where: eq(schema.user.id, 'u3') }))
      assert.isUndefined(u3)
    }),
  )

  it.effect('rejects interactive transactions, which D1 does not support', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const error = yield* db.use((d) => d.transaction(async () => undefined)).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'DbError')
    }),
  )
})
