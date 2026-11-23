import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'

/**
 * Minimal D1 emulation over node:sqlite for tests. Implements what Drizzle's D1 driver calls
 * (prepare/bind/all/run/raw/first, batch, exec) and mirrors D1 where it matters for correctness:
 * - `batch` is atomic (one failing statement rolls back the whole batch);
 * - interactive transactions (BEGIN/SAVEPOINT/...) are rejected, as on D1;
 * - booleans bind as 1/0 and `undefined` is rejected.
 */

const MIGRATIONS_DIR = new URL('../../../drizzle/', import.meta.url)
const TRANSACTION_SQL = /^\s*(begin|commit|end|rollback|savepoint|release)\b/i

const meta = (changes = 0, lastRowId = 0) => ({
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: changes,
  last_row_id: lastRowId,
  changed_db: changes > 0,
  changes,
})

const toSqlite = (value: unknown): SQLInputValue | Error => {
  if (value === undefined) return new TypeError('D1_TYPE_ERROR: Type "undefined" not supported')
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  return new TypeError(`D1_TYPE_ERROR: Type "${typeof value}" not supported`)
}

class MemoryStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: ReadonlyArray<unknown> = [],
  ) {}

  bind(...values: ReadonlyArray<unknown>) {
    return new MemoryStatement(this.db, this.sql, values)
  }

  /** Prepares and binds; returns an Error instead of throwing so callers can reject. */
  private prepared(): { stmt: StatementSync; params: SQLInputValue[] } | Error {
    if (TRANSACTION_SQL.test(this.sql)) {
      return new Error('D1 does not support interactive transactions; group writes with db.batch([...])')
    }
    const params: SQLInputValue[] = []
    for (const value of this.params) {
      const converted = toSqlite(value)
      if (converted instanceof Error) return converted
      params.push(converted)
    }
    return { stmt: this.db.prepare(this.sql), params }
  }

  /** Synchronous execution, shared by the async methods and by batch. */
  execute() {
    const p = this.prepared()
    if (p instanceof Error) return p
    if (p.stmt.columns().length === 0) {
      const r = p.stmt.run(...p.params)
      return { success: true as const, results: [], meta: meta(Number(r.changes), Number(r.lastInsertRowid)) }
    }
    return { success: true as const, results: p.stmt.all(...p.params), meta: meta() }
  }

  all() {
    return settle(() => this.execute())
  }

  run() {
    return settle(() => this.execute())
  }

  first(column?: string) {
    return settle(() => {
      const r = this.execute()
      if (r instanceof Error) return r
      const row = r.results[0]
      if (row === undefined) return null
      return column === undefined ? row : (row[column] ?? null)
    })
  }

  raw() {
    return settle(() => {
      const p = this.prepared()
      if (p instanceof Error) return p
      p.stmt.setReturnArrays(true)
      return p.stmt.all(...p.params)
    })
  }
}

/** Runs `f` inside a Promise: returned Errors and errors thrown by node:sqlite both reject. */
const settle = <A>(f: () => A | Error): Promise<A> =>
  new Promise((resolve, reject) => {
    const result = f()
    if (result instanceof Error) reject(result)
    else resolve(result)
  })

const executeAll = (statements: ReadonlyArray<MemoryStatement>) => {
  const results = []
  for (const statement of statements) {
    const r = statement.execute()
    if (r instanceof Error) return r
    results.push(r)
  }
  return results
}

/**
 * Synchronous all-or-nothing batch. `finally` (no catch) rolls back on a returned Error or on an error
 * thrown by node:sqlite, which then rejects the surrounding `settle` Promise.
 */
const runBatch = (sqlite: DatabaseSync, statements: ReadonlyArray<MemoryStatement>) => {
  sqlite.exec('BEGIN')
  let committed = false
  try {
    const results = executeAll(statements)
    if (results instanceof Error) return results
    sqlite.exec('COMMIT')
    committed = true
    return results
  } finally {
    if (!committed) sqlite.exec('ROLLBACK')
  }
}

export interface MemoryD1 {
  readonly binding: D1Database
  readonly sqlite: DatabaseSync
  readonly close: () => void
}

/** Applies drizzle/*.sql in journal order, exactly as Wrangler would for a new database. */
const applyMigrations = (db: DatabaseSync) => {
  const journal: { entries: ReadonlyArray<{ tag: string }> } = JSON.parse(
    readFileSync(new URL('meta/_journal.json', MIGRATIONS_DIR), 'utf8'),
  )
  for (const { tag } of journal.entries) {
    const sql = readFileSync(new URL(`${tag}.sql`, MIGRATIONS_DIR), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement)
    }
  }
}

export const openMemoryD1 = (options: { migrate?: boolean } = {}): MemoryD1 => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  if (options.migrate !== false) applyMigrations(sqlite)

  const binding = {
    prepare: (sql: string) => new MemoryStatement(sqlite, sql),
    // D1 runs a batch as one SQL transaction: any failure rolls back every statement. BEGIN..COMMIT runs in
    // one synchronous call, so no other query can interleave and be swept into (or rolled back with) it.
    batch: (statements: ReadonlyArray<MemoryStatement>) => settle(() => runBatch(sqlite, statements)),
    exec: (sql: string) =>
      settle(() => {
        sqlite.exec(sql)
        return { count: sql.split(';').filter((s) => s.trim()).length, duration: 0 }
      }),
  }

  return {
    // The emulation covers the surface Drizzle uses, not D1's full interface (sessions, dump).
    binding: binding as unknown as D1Database,
    sqlite,
    close: () => sqlite.close(),
  }
}
