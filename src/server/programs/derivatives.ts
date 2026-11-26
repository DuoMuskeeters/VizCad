/**
 * The GLB derivative's write path (docs/11 §2.3): the browser converts STEP/IGES/3MF in its Worker and uploads the GLB
 * with a presigned PUT, like a file upload (`derivative_sessions` instead of `upload_sessions`). The server never
 * trusts what the browser says about the object: size and ETag come from HEAD, the first 20 bytes from a Range read
 * must be a GLB header for exactly that size, and the file must still be on the version the conversion started from.
 */
import { and, eq, lt, sql } from 'drizzle-orm'
import { Effect, Option } from 'effect'
import * as schema from '../db/schema'
import {
  type DerivativeFailureCode, type DerivativeStats, failedMetaText, readyMetaText,
} from '../derivative'
import {
  FileTooLarge, InvalidDerivative, UnsupportedFileType, UploadIncomplete, UploadLimitReached, UploadMismatch, UploadUnavailable,
  VersionChanged,
} from '../errors'
import { GLB_HEADER_BYTES, isValidGlbHeader } from '../glb'
import { fileTypeOfExtension, hasDerivative } from '../../shared/fileTypes'
import { Db, type Database } from '../services/Db'
import { Entitlements, maxDerivativeBytes } from '../services/Entitlements'
import { RateLimit } from '../services/RateLimit'
import { normalizeEtag, readBytes, Storage } from '../services/Storage'
import { authorizeDelivery, workspaceOfFile } from './delivery'
import { currentVersionOf, openFile } from './fileContext'
import { drainStorageDeletions, enqueueDeletion } from './storageCleanup'
import { guard, newUlid, nowSeconds, runBatch, stillRole, toDate, toSeconds, type Caller } from './shared'
import { objectKey, UPLOAD_CONTENT_TYPE, uploadTtlSeconds } from './uploads'

export interface DerivativeTicket {
  readonly sessionId: string
  /** Presigned PUT URL: exactly `headers` and the declared number of bytes. */
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** Unix seconds. */
  readonly expiresAt: number
}

type SessionRow = typeof schema.derivativeSessions.$inferSelect

/** The derivative of a file's current version is keyed next to its objects: `w/{ws}/f/{file}/{ulid}.glb` (docs/11 §2.2). */
export const derivativeKey = (workspaceId: string, fileId: string, objectId: string) => `${objectKey(workspaceId, fileId, objectId)}.glb`

/** The file is still on the version (source object) the conversion started from, untrashed. Evaluated in the batch. */
const onSource = (fileId: string, sourceR2Key: string) => sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND r2Key = ${sourceR2Key})`

const sessionPending = (sessionId: string) =>
  sql`EXISTS (SELECT 1 FROM derivative_sessions WHERE id = ${sessionId} AND status = 'pending' AND expiresAt > unixepoch())`

const openSessions = (userId: string, now: number) =>
  sql`(SELECT count(*) FROM derivative_sessions WHERE userId = ${userId} AND status = 'pending' AND expiresAt > ${now})`

/**
 * The file and the caller's `edit` on it, for a STEP/IGES/3MF only. `version` is the number the browser converted;
 * another current number means a new version (or a restore) landed meanwhile: `VersionChanged`.
 */
const openForDerivative = Effect.fnUntraced(function* (caller: Caller, fileId: string, version: number) {
  const workspaceId = yield* workspaceOfFile(fileId)
  const opened = yield* openFile(caller, workspaceId, fileId)
  yield* authorizeDelivery(opened.base, { kind: 'edit' })
  const type = fileTypeOfExtension(opened.file.extension)
  if (type === undefined || !hasDerivative(type.id)) return yield* new UnsupportedFileType()
  if ((yield* currentVersionOf(opened.file)) !== version) return yield* new VersionChanged()
  return { ...opened, workspaceId }
})

/**
 * `POST /api/files/{id}/derivative/start { version, size }` (docs/11 §2.3). `edit`; STEP/IGES/3MF; the source at most
 * `maxConvertBytes` (a larger one is never converted, D22); the GLB at most `maxDerivativeBytes` (a multiple of the source,
 * since GLBs are not counted in storage); rate limit `derivativeStart`
 * (user and IP) and at most `uploadSessionsPerUser` open sessions. The URL binds the key (minted here), the exact
 * Content-Length and `If-None-Match: *`; the session binds the source object, so a completion after a new version fails.
 */
export const startDerivative = Effect.fn('startDerivative')(function* (
  caller: Caller,
  input: { readonly fileId: string; readonly version: number; readonly size: number },
) {
  const { file, role, still, workspaceId, base } = yield* openForDerivative(caller, input.fileId, input.version)
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  if (file.size > limits.maxConvertBytes || input.size > maxDerivativeBytes(limits, file.size)) return yield* new FileTooLarge()
  yield* (yield* RateLimit).hit({ action: 'derivativeStart', target: caller.userId, ip: caller.ip })
  const db = yield* Db
  const now = base.now
  const open = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${openSessions(caller.userId, now)} AS n`))
  if ((open?.n ?? 0) >= limits.uploadSessionsPerUser) return yield* new UploadLimitReached()

  const sessionId = yield* newUlid
  const key = derivativeKey(workspaceId, file.id, yield* newUlid)
  const ttl = uploadTtlSeconds(input.size)
  const url = yield* (yield* Storage).presignUpload(key, { expiresInSeconds: ttl, contentType: UPLOAD_CONTENT_TYPE, contentLength: input.size, ifNoneMatch: '*' })
  yield* runBatch((d) => [
    guard(d, sql.join([
      stillRole(workspaceId, caller.userId, [role]), still(false), onSource(file.id, file.r2Key),
      sql`${openSessions(caller.userId, now)} < ${limits.uploadSessionsPerUser}`,
    ], sql` AND `)),
    d.insert(schema.derivativeSessions).values({
      id: sessionId, workspaceId, fileId: file.id, sourceR2Key: file.r2Key, userId: caller.userId, r2Key: key, declaredSize: input.size,
      status: 'pending', expiresAt: toDate(now + ttl), createdAt: toDate(now), completedAt: null,
    }),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new VersionChanged())))
  return { sessionId, url: url.toString(), headers: { 'Content-Type': UPLOAD_CONTENT_TYPE, 'If-None-Match': '*' }, expiresAt: now + ttl } satisfies DerivativeTicket
})

/** The signed URL may be used until the session's expiry; its queue row must outlive it (plus clock slack). */
const urlDeadAt = (session: SessionRow) => toSeconds(session.expiresAt) + 5 * 60

/** Marks the session rejected and queues its object (D1 first), tries the deletion now; always ends in `error`. */
const reject = Effect.fnUntraced(function* <E>(session: SessionRow, now: number, error: E) {
  yield* runBatch((d) => [
    guard(d, sql`EXISTS (SELECT 1 FROM derivative_sessions WHERE id = ${session.id} AND status = 'pending')`),
    d.update(schema.derivativeSessions).set({ status: 'rejected' }).where(eq(schema.derivativeSessions.id, session.id)),
    enqueueDeletion(d, session.r2Key, 'upload_rejected', now, urlDeadAt(session)),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.void))
  yield* drainStorageDeletions({ keys: [session.r2Key] }).pipe(Effect.ignore)
  return yield* Effect.fail(error)
})

const loadSession = Effect.fnUntraced(function* (userId: string, fileId: string, sessionId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.derivativeSessions).where(and(
      eq(schema.derivativeSessions.id, sessionId), eq(schema.derivativeSessions.userId, userId), eq(schema.derivativeSessions.fileId, fileId),
    )).limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new UploadUnavailable()
  return row
})

/** Queues the derivative the file holds now (read at write time, so a concurrent replacement is not lost), unless it is `keep`. */
const queueCurrentDerivative = (d: Database, fileId: string, keep: string | null, now: number) =>
  d.insert(schema.storageDeletions).select(sql`SELECT derivativeR2Key, 'purged', ${now}, 0, NULL, ${now} FROM files
    WHERE id = ${fileId} AND derivativeR2Key IS NOT NULL AND derivativeR2Key IS NOT ${keep}`).onConflictDoNothing()

/**
 * A restore brings a snapshot's GLB back and snapshots the current state, so the same source object can sit in several
 * `file_versions` rows, each with its own GLB (one per restore-and-derive). Completing a GLB for that source points
 * them all at it: queues the GLBs they hold now (read at write time), unless a row outside that set still holds one,
 * and the update below repoints them. One GLB per source object stays in R2.
 */
const queueSnapshotDerivatives = (d: Database, fileId: string, sourceR2Key: string, keep: string, now: number) =>
  d.insert(schema.storageDeletions).select(sql`SELECT DISTINCT v.derivativeR2Key, 'purged', ${now}, 0, NULL, ${now} FROM file_versions v
    WHERE v.fileId = ${fileId} AND v.r2Key = ${sourceR2Key} AND v.derivativeR2Key IS NOT NULL AND v.derivativeR2Key IS NOT ${keep}
      AND NOT EXISTS (SELECT 1 FROM file_versions o WHERE o.derivativeR2Key = v.derivativeR2Key AND NOT (o.fileId = ${fileId} AND o.r2Key = ${sourceR2Key}))
      AND NOT EXISTS (SELECT 1 FROM files f WHERE f.derivativeR2Key = v.derivativeR2Key AND f.id <> ${fileId})`).onConflictDoNothing()

/**
 * `POST /api/files/{id}/derivative/complete { sessionId, etag, stats }` (docs/11 §2.3). Re-checks `edit`, then: the
 * file still on the session's source object (else the GLB is of an old version: deleted, `VersionChanged`), the object's
 * size and ETag (HEAD) equal to what was declared and reported, at most `maxDerivativeBytes`, and its first 20 bytes a GLB 2.0
 * header whose length is the object's size and whose first chunk is JSON (else `InvalidDerivative`). One batch, guarded on
 * the same source key, then points the file and its snapshots of the same source object at the GLB, queues the
 * derivatives they replace (`queueSnapshotDerivatives`) and completes the session.
 * Idempotent: a completed session answers the same.
 */
export const completeDerivative = Effect.fn('completeDerivative')(function* (
  caller: Caller,
  input: { readonly fileId: string; readonly sessionId: string; readonly etag: string; readonly stats: DerivativeStats },
) {
  const session = yield* loadSession(caller.userId, input.fileId, input.sessionId)
  if (session.status === 'completed') return { state: 'ready' as const }
  const now = yield* nowSeconds
  if (session.status !== 'pending' || toSeconds(session.expiresAt) <= now) return yield* new UploadUnavailable()
  const { file, role, still } = yield* openFile(caller, session.workspaceId, session.fileId).pipe(
    Effect.tap((opened) => authorizeDelivery(opened.base, { kind: 'edit' })),
  )
  if (file.r2Key !== session.sourceR2Key) return yield* reject(session, now, new VersionChanged())
  const limits = yield* (yield* Entitlements).limits(session.workspaceId)
  const storage = yield* Storage

  const head = yield* storage.head(session.r2Key)
  if (Option.isNone(head)) return yield* new UploadIncomplete()
  const etag = normalizeEtag(head.value.etag)
  if (head.value.size !== session.declaredSize || normalizeEtag(input.etag) !== etag) return yield* reject(session, now, new UploadMismatch())
  if (head.value.size > maxDerivativeBytes(limits, file.size)) return yield* reject(session, now, new FileTooLarge())
  const first = yield* storage.getRange(session.r2Key, { offset: 0, length: GLB_HEADER_BYTES })
  if (Option.isNone(first)) return yield* new UploadIncomplete()
  if (normalizeEtag(first.value.etag) !== etag) return yield* reject(session, now, new UploadMismatch())
  if (!isValidGlbHeader(yield* readBytes(session.r2Key, first.value), head.value.size)) return yield* reject(session, now, new InvalidDerivative())

  const db = yield* Db
  // Only for the immediate drain below: the batch reads the keys again at write time.
  const snapshotKeys = yield* db.use((d) =>
    d.selectDistinct({ key: schema.fileVersions.derivativeR2Key }).from(schema.fileVersions)
      .where(and(eq(schema.fileVersions.fileId, file.id), eq(schema.fileVersions.r2Key, session.sourceR2Key))),
  )
  const ready = { derivativeR2Key: session.r2Key, derivativeState: 'ready' as const, derivativeMeta: readyMetaText(input.stats, head.value.size, etag) }
  yield* runBatch((d) => [
    guard(d, sql.join([sessionPending(session.id), stillRole(session.workspaceId, caller.userId, [role]), still(false), onSource(file.id, session.sourceR2Key)], sql` AND `)),
    queueCurrentDerivative(d, file.id, session.r2Key, now),
    queueSnapshotDerivatives(d, file.id, session.sourceR2Key, session.r2Key, now),
    d.update(schema.files).set(ready).where(and(eq(schema.files.id, file.id), eq(schema.files.r2Key, session.sourceR2Key))),
    d.update(schema.fileVersions).set(ready).where(and(eq(schema.fileVersions.fileId, file.id), eq(schema.fileVersions.r2Key, session.sourceR2Key))),
    d.update(schema.derivativeSessions).set({ status: 'completed', completedAt: toDate(now) }).where(eq(schema.derivativeSessions.id, session.id)),
  ]).pipe(
    // A concurrent call completed this very session (same answer), or the file moved on (the GLB is stale).
    Effect.catchTag('WriteConflict', (conflict) =>
      Effect.gen(function* () {
        const latest = yield* loadSession(caller.userId, input.fileId, session.id)
        if (latest.status === 'completed') return
        if (latest.status !== 'pending') return yield* new UploadUnavailable()
        const moved = yield* db.use((d) => d.select({ r2Key: schema.files.r2Key }).from(schema.files).where(eq(schema.files.id, file.id)).limit(1))
        if (moved[0]?.r2Key !== session.sourceR2Key) return yield* reject(session, now, new VersionChanged())
        return yield* conflict
      })),
  )
  const replaced = [...new Set([file.derivativeR2Key, ...snapshotKeys.map((row) => row.key)])].filter((key): key is string => key !== null && key !== session.r2Key)
  if (replaced.length > 0) yield* drainStorageDeletions({ keys: replaced }).pipe(Effect.ignore)
  return { state: 'ready' as const }
})

/**
 * `POST /api/files/{id}/derivative/failed { version, code }` (docs/11 §2.3): the browser could not convert the file.
 * `too_large` and `glb_too_large` become the `too_large` state, every other code `failed` with the code kept for the text (§8). `edit`
 * only. Never overwrites a stored derivative, and a new version since the attempt is `VersionChanged`. `failed` is not
 * final: an edit user's retry starts a new conversion; it only stops automatic retries on every desktop open.
 */
export const failDerivative = Effect.fn('failDerivative')(function* (
  caller: Caller,
  input: { readonly fileId: string; readonly version: number; readonly code: DerivativeFailureCode },
) {
  const { file, role, still, workspaceId } = yield* openForDerivative(caller, input.fileId, input.version)
  const state = input.code === 'too_large' || input.code === 'glb_too_large' ? 'too_large' : 'failed'
  yield* runBatch((d) => [
    guard(d, sql.join([stillRole(workspaceId, caller.userId, [role]), still(false), onSource(file.id, file.r2Key)], sql` AND `)),
    d.update(schema.files).set({ derivativeState: state, derivativeMeta: failedMetaText(input.code) })
      .where(and(eq(schema.files.id, file.id), eq(schema.files.r2Key, file.r2Key), sql`${schema.files.derivativeR2Key} IS NULL`)),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new VersionChanged())))
  return { state: file.derivativeR2Key === null ? state : ('ready' as const) }
})

/** Same grace as upload sessions: an hour after the URL died. */
const EXPIRY_GRACE_SECONDS = 60 * 60
const EXPIRE_BATCH = 50

/**
 * Hourly: pending derivative sessions past `expiresAt + 1 hour` become `expired` and their GLB keys go to the deletion
 * queue in the same batch (the browser may have uploaded without completing, or the tab closed). Returns the count.
 */
export const expireDerivativeSessions = Effect.fn('expireDerivativeSessions')(function* () {
  const db = yield* Db
  const now = yield* nowSeconds
  const stale = yield* db.use((d) =>
    d.select({ id: schema.derivativeSessions.id, r2Key: schema.derivativeSessions.r2Key }).from(schema.derivativeSessions)
      .where(and(eq(schema.derivativeSessions.status, 'pending'), lt(schema.derivativeSessions.expiresAt, toDate(now - EXPIRY_GRACE_SECONDS))))
      .orderBy(schema.derivativeSessions.expiresAt)
      .limit(EXPIRE_BATCH),
  )
  if (stale.length === 0) return 0
  yield* runBatch((d) => stale.flatMap((s) => [
    d.update(schema.derivativeSessions).set({ status: 'expired' }).where(and(eq(schema.derivativeSessions.id, s.id), eq(schema.derivativeSessions.status, 'pending'))),
    enqueueDeletion(d, s.r2Key, 'upload_expired', now),
  ]))
  return stale.length
})
