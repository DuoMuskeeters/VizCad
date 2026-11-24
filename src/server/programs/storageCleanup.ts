import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { Db, type Database } from '../services/Db'
import { Storage } from '../services/Storage'
import { runBatch, nowSeconds, toDate } from './shared'

type DeletionReason = (typeof schema.storageDeletionReasons)[number]

/** A batch statement that queues an R2 key for deletion; a key already queued stays as it is. */
export const enqueueDeletion = (d: Database, key: string, reason: DeletionReason, now: number) =>
  d.insert(schema.storageDeletions).values({ key, reason, createdAt: toDate(now), attempts: 0, notBefore: toDate(now) }).onConflictDoNothing()

/** Keys under this prefix are blog images; the worker never deletes them (docs/09 §5.3). */
const PROTECTED_PREFIX = 'blog/'
const MAX_ATTEMPTS = 10
const BACKOFF_BASE_SECONDS = 60
const BACKOFF_MAX_SECONDS = 24 * 60 * 60

const referenced = (d: Database, key: string) =>
  d.get<{ referenced: number }>(sql`SELECT (
    EXISTS (SELECT 1 FROM files WHERE r2Key = ${key} OR thumbnailR2Key = ${key})
    OR EXISTS (SELECT 1 FROM file_versions WHERE r2Key = ${key} OR thumbnailR2Key = ${key})
    OR EXISTS (SELECT 1 FROM upload_sessions WHERE r2Key = ${key} AND status = 'pending')
  ) AS referenced`)

export interface DrainSummary {
  readonly deleted: number
  /** Queue rows dropped without touching R2: the key is still referenced in D1, or is a protected key. */
  readonly skipped: number
  readonly failed: number
}

/**
 * Deletes queued R2 objects, D1 first and R2 second (docs/09 §5.3): a key is deleted from R2 only when no row in D1
 * references it any more, and its queue row goes away only after R2 confirmed. Failures back off exponentially.
 * `keys` limits the run to those keys (the rejection path tries its own key right away); without it, up to `limit` due rows.
 */
export const drainStorageDeletions = Effect.fn('drainStorageDeletions')(function* (options: { readonly limit?: number; readonly keys?: ReadonlyArray<string> } = {}) {
  const db = yield* Db
  const storage = yield* Storage
  const now = yield* nowSeconds
  const rows = yield* db.use((d) =>
    d.select().from(schema.storageDeletions)
      .where(options.keys === undefined
        ? lte(schema.storageDeletions.notBefore, toDate(now))
        : inArray(schema.storageDeletions.key, [...options.keys]))
      .orderBy(asc(schema.storageDeletions.notBefore))
      .limit(options.limit ?? 100),
  )
  let deleted = 0
  let skipped = 0
  let failed = 0
  for (const row of rows) {
    const drop = db.use((d) => d.delete(schema.storageDeletions).where(eq(schema.storageDeletions.key, row.key)))
    if (row.key.startsWith(PROTECTED_PREFIX) || ((yield* db.use((d) => referenced(d, row.key)))?.referenced ?? 0) === 1) {
      yield* drop
      skipped++
      continue
    }
    const removed = yield* storage.delete([row.key]).pipe(Effect.as(true), Effect.catchTag('StorageError', () => Effect.succeed(false)))
    if (removed) {
      yield* drop
      deleted++
      continue
    }
    failed++
    const attempts = row.attempts + 1
    if (attempts >= MAX_ATTEMPTS) yield* Effect.logError('storage deletion keeps failing').pipe(Effect.annotateLogs({ label: 'storage.deletion.stuck', attempts }))
    const backoff = Math.min(BACKOFF_BASE_SECONDS * 2 ** attempts, BACKOFF_MAX_SECONDS)
    yield* db.use((d) =>
      d.update(schema.storageDeletions)
        .set({ attempts, lastError: 'StorageError', notBefore: toDate(now + backoff) })
        .where(eq(schema.storageDeletions.key, row.key)),
    )
  }
  return { deleted, skipped, failed } satisfies DrainSummary
})

/** An upload URL lives at most an hour; a session that still is not completed an hour after its expiry is abandoned. */
const EXPIRY_GRACE_SECONDS = 60 * 60
const EXPIRE_BATCH = 50

/**
 * Hourly: pending sessions past `expiresAt + 1 hour` become `expired` and their keys go to the deletion queue in the same
 * batch (the browser may have uploaded without ever completing). Returns how many sessions were expired.
 */
export const expireUploadSessions = Effect.fn('expireUploadSessions')(function* () {
  const db = yield* Db
  const now = yield* nowSeconds
  const stale = yield* db.use((d) =>
    d.select({ id: schema.uploadSessions.id, r2Key: schema.uploadSessions.r2Key }).from(schema.uploadSessions)
      .where(and(eq(schema.uploadSessions.status, 'pending'), lt(schema.uploadSessions.expiresAt, toDate(now - EXPIRY_GRACE_SECONDS))))
      .orderBy(asc(schema.uploadSessions.expiresAt))
      .limit(EXPIRE_BATCH),
  )
  if (stale.length === 0) return 0
  yield* runBatch((d) => [
    d.update(schema.uploadSessions).set({ status: 'expired' })
      .where(and(inArray(schema.uploadSessions.id, stale.map((s) => s.id)), eq(schema.uploadSessions.status, 'pending'))),
    ...stale.map((s) => enqueueDeletion(d, s.r2Key, 'upload_expired', now)),
  ])
  return stale.length
})

const PRUNE_BATCH = 1000
const PRUNE_MAX_ROUNDS = 20

/** Daily: deletes `security_log` rows older than `retentionDays` (D21: 90), at most 20 000 per run. */
export const pruneSecurityLog = Effect.fn('pruneSecurityLog')(function* (retentionDays: number) {
  const db = yield* Db
  const cutoff = toDate((yield* nowSeconds) - retentionDays * 24 * 60 * 60)
  let total = 0
  for (let round = 0; round < PRUNE_MAX_ROUNDS; round++) {
    const gone = yield* db.use((d) =>
      d.delete(schema.securityLog)
        .where(inArray(schema.securityLog.id, d.select({ id: schema.securityLog.id }).from(schema.securityLog).where(lt(schema.securityLog.createdAt, cutoff)).limit(PRUNE_BATCH)))
        .returning({ id: schema.securityLog.id }),
    )
    total += gone.length
    if (gone.length < PRUNE_BATCH) break
  }
  return total
})
