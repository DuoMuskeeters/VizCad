import { and, eq, sql } from 'drizzle-orm'
import { Effect, Option } from 'effect'
import * as schema from '../db/schema'
import {
  FileTooLarge, ResourceUnavailable, StorageQuotaExceeded, UnsupportedFileType, UploadIncomplete, UploadLimitReached, UploadMismatch,
  UploadUnavailable, ValidationError, VersionTypeMismatch,
} from '../errors'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { normalizeEtag, readBytes, Storage } from '../services/Storage'
import {
  extensionOf, fileTypeOfExtension, hasValidSignature, isValidFileName, SIGNATURE_BYTES, signatureNeedsTail,
} from '../../shared/fileTypes'
import { drainStorageDeletions, enqueueDeletion } from './storageCleanup'
import {
  activity, authorize, type Caller, fileForPermission, fileGrantOf, guard, loadProject, newUlid, nowSeconds, permissionActor,
  projectForPermission, projectGrantOf, projectStill, requireMembership, runBatch, stillRole, toDate, toSeconds,
} from './shared'

/** The one content type of every presigned upload; the file's real type comes from its extension and bytes. */
export const UPLOAD_CONTENT_TYPE = 'application/octet-stream'

/** Presigned URL lifetime: `clamp(600 s, size / 1 MB/s × 2, 3600 s)` (docs/09 §2.4). */
export const uploadTtlSeconds = (size: number) => Math.min(3600, Math.max(600, Math.ceil((size / 1_000_000) * 2)))

/**
 * The R2 key of a new object. Built only from server-minted ids; no client text (name, MIME, key) ever reaches it
 * (docs/09 rule 1).
 */
export const objectKey = (workspaceId: string, fileId: string, objectId: string) => `w/${workspaceId}/f/${fileId}/${objectId}`

export interface UploadTicket {
  readonly uploadId: string
  /** Presigned PUT URL. The browser sends exactly `headers` (and the declared number of bytes). */
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** Unix seconds. */
  readonly expiresAt: number
}

export interface UploadedFile {
  readonly fileId: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly versionNumber: number
  readonly isNewVersion: boolean
}

type SessionRow = typeof schema.uploadSessions.$inferSelect

/** Bytes the workspace holds: files and versions, a key shared by both counted once, trash included (docs/09 §2.3). */
const committedBytes = (workspaceId: string) =>
  sql`(SELECT COALESCE(SUM(size), 0) FROM (
    SELECT r2Key, size FROM files WHERE workspaceId = ${workspaceId}
    UNION
    SELECT v.r2Key, v.size FROM file_versions v JOIN files f ON f.id = v.fileId WHERE f.workspaceId = ${workspaceId}))`

/** Declared size of the open sessions; `except` leaves one session out (the one being completed holds its own space). */
const reservedBytes = (workspaceId: string, now: number, except: string | null) =>
  sql`(SELECT COALESCE(SUM(declaredSize), 0) FROM upload_sessions
    WHERE workspaceId = ${workspaceId} AND status = 'pending' AND expiresAt > ${now} AND id <> ${except ?? ''})`

const fitsQuota = (workspaceId: string, now: number, except: string | null, size: number, limit: number) =>
  sql`${committedBytes(workspaceId)} + ${reservedBytes(workspaceId, now, except)} + ${size} <= ${limit}`

const openSessions = (userId: string, now: number) =>
  sql`(SELECT count(*) FROM upload_sessions WHERE userId = ${userId} AND status = 'pending' AND expiresAt > ${now})`

const sessionPending = (sessionId: string, now: number) =>
  sql`EXISTS (SELECT 1 FROM upload_sessions WHERE id = ${sessionId} AND status = 'pending' AND expiresAt > ${now})`

const usedBytes = Effect.fnUntraced(function* (workspaceId: string, now: number, except: string | null) {
  const db = yield* Db
  const row = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${committedBytes(workspaceId)} + ${reservedBytes(workspaceId, now, except)} AS n`))
  return row?.n ?? 0
})

/** The file a new version goes to, in this workspace. Trashed or not yet uploaded files are not available. */
const loadTarget = Effect.fnUntraced(function* (workspaceId: string, fileId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.files).where(and(eq(schema.files.id, fileId), eq(schema.files.workspaceId, workspaceId))).limit(1),
  )
  const row = rows[0]
  if (row === undefined || row.isDeleted || row.status !== 'uploaded') return yield* new ResourceUnavailable()
  return row
})

interface Target {
  readonly projectId: string | null
  readonly fileId: string | null
}

/**
 * Membership, then permissions.ts: `uploadFile` / `uploadProjectFile` for a new file, `uploadVersion` for a version.
 * Used at request and again at completion, so access taken away in between stops the upload.
 */
const authorizeUpload = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, target: Target, now: number) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const actor = permissionActor(caller, workspace.id, role)
  if (target.fileId !== null) {
    const file = yield* loadTarget(workspace.id, target.fileId)
    const project = file.projectId === null ? undefined : yield* loadProject(workspace.id, file.projectId)
    const projectGrant = project === undefined ? undefined : yield* projectGrantOf(workspace.id, project.id, caller.userId)
    const fileGrant = yield* fileGrantOf(workspace.id, file.id, caller.userId)
    yield* authorize({
      actor, workspace, now, action: { kind: 'uploadVersion' }, file: fileForPermission(file, workspace.id),
      ...(project === undefined ? {} : { project: projectForPermission(project) }),
      ...(projectGrant === undefined ? {} : { projectGrant }),
      ...(fileGrant === undefined ? {} : { fileGrant }),
    })
    return { role, file, projectId: file.projectId, projectMode: project?.accessMode ?? null }
  }
  if (target.projectId !== null) {
    const project = yield* loadProject(workspace.id, target.projectId)
    const projectGrant = yield* projectGrantOf(workspace.id, project.id, caller.userId)
    yield* authorize({
      actor, workspace, now, action: { kind: 'uploadProjectFile' }, project: projectForPermission(project),
      ...(projectGrant === undefined ? {} : { projectGrant }),
    })
    return { role, file: null, projectId: project.id, projectMode: project.accessMode }
  }
  yield* authorize({ actor, workspace, now, action: { kind: 'uploadFile' } })
  return { role, file: null, projectId: null, projectMode: null }
})

/**
 * Starts an upload: validates the name, type and size, checks permission, the per-file limit, the storage quota and the
 * open-session limit, reserves the space in an `upload_sessions` row and signs a one-shot, size-bound PUT URL for a key
 * the server picks (docs/09 §2.4 step 1). Nothing the client sends except the name's extension and size shapes the URL.
 */
export const requestUpload = Effect.fn('requestUpload')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly projectId?: string; readonly targetFileId?: string; readonly name: string; readonly size: number },
) {
  if (!isValidFileName(input.name) || !Number.isSafeInteger(input.size) || input.size < 1 || (input.projectId !== undefined && input.targetFileId !== undefined)) {
    return yield* new ValidationError({ message: 'invalid upload request' })
  }
  const extension = extensionOf(input.name)
  if (fileTypeOfExtension(extension) === undefined) return yield* new UnsupportedFileType()

  const now = yield* nowSeconds
  const access = yield* authorizeUpload(caller, input.workspaceId, { projectId: input.projectId ?? null, fileId: input.targetFileId ?? null }, now)
  if (access.file !== null && access.file.extension !== extension) return yield* new VersionTypeMismatch()

  const limits = yield* (yield* Entitlements).limits(input.workspaceId)
  if (input.size > limits.maxFileBytes) return yield* new FileTooLarge()
  const db = yield* Db
  const sessions = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${openSessions(caller.userId, now)} AS n`))
  if ((sessions?.n ?? 0) >= limits.uploadSessionsPerUser) return yield* new UploadLimitReached()
  if ((yield* usedBytes(input.workspaceId, now, null)) + input.size > limits.storageBytes) return yield* new StorageQuotaExceeded()

  const fileId = access.file?.id ?? (yield* newUlid)
  const objectId = yield* newUlid
  const uploadId = yield* newUlid
  const key = objectKey(input.workspaceId, fileId, objectId)
  const ttl = uploadTtlSeconds(input.size)
  const url = yield* (yield* Storage).presignUpload(key, {
    expiresInSeconds: ttl,
    contentType: UPLOAD_CONTENT_TYPE,
    contentLength: input.size,
    ifNoneMatch: '*',
  })
  const conditions = [
    stillRole(input.workspaceId, caller.userId, [access.role]),
    fitsQuota(input.workspaceId, now, null, input.size, limits.storageBytes),
    sql`${openSessions(caller.userId, now)} < ${limits.uploadSessionsPerUser}`,
    ...(access.projectId !== null && access.projectMode !== null ? [projectStill(access.projectId, access.projectMode)] : []),
    ...(access.file === null ? [] : [sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND workspaceId = ${input.workspaceId} AND isDeleted = 0 AND status = 'uploaded')`]),
  ]
  yield* runBatch((d) => [
    guard(d, sql.join(conditions, sql` AND `)),
    d.insert(schema.uploadSessions).values({
      id: uploadId, workspaceId: input.workspaceId, projectId: access.projectId, fileId, targetFileId: access.file?.id ?? null,
      userId: caller.userId, r2Key: key, objectId, name: input.name, extension, declaredSize: input.size, status: 'pending',
      expiresAt: toDate(now + ttl), createdAt: toDate(now), completedAt: null,
    }),
  ])
  return {
    uploadId,
    url: url.toString(),
    headers: { 'Content-Type': UPLOAD_CONTENT_TYPE, 'If-None-Match': '*' },
    expiresAt: now + ttl,
  } satisfies UploadTicket
})

const loadSession = Effect.fnUntraced(function* (userId: string, uploadId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, uploadId), eq(schema.uploadSessions.userId, userId))).limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new UploadUnavailable()
  return row
})

/** What a finished session produced, read from the file as it is now (so a repeated call returns the same ids). */
const uploadedFile = Effect.fnUntraced(function* (session: SessionRow) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({
      name: schema.files.name, extension: schema.files.extension, size: schema.files.size, current: schema.files.currentVersionNumber,
    }).from(schema.files).where(and(eq(schema.files.id, session.fileId), eq(schema.files.workspaceId, session.workspaceId))).limit(1),
  )
  const file = rows[0]
  if (file === undefined) return yield* new UploadUnavailable()
  return {
    fileId: session.fileId, name: file.name, extension: file.extension, size: file.size,
    versionNumber: file.current ?? 1, isNewVersion: session.targetFileId !== null,
  } satisfies UploadedFile
})

/**
 * Marks the session rejected and queues its object for deletion in one batch (D1 first), then tries the deletion right
 * away; the hourly job retries what fails. Always ends in `error`.
 */
const reject = Effect.fnUntraced(function* <E>(session: SessionRow, now: number, error: E) {
  yield* runBatch((d) => [
    guard(d, sql`EXISTS (SELECT 1 FROM upload_sessions WHERE id = ${session.id} AND status = 'pending')`),
    d.update(schema.uploadSessions).set({ status: 'rejected' }).where(eq(schema.uploadSessions.id, session.id)),
    enqueueDeletion(d, session.r2Key, 'upload_rejected', now),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.void))
  yield* drainStorageDeletions({ keys: [session.r2Key] }).pipe(Effect.ignore)
  return yield* Effect.fail(error)
})

/**
 * Finishes an upload (docs/09 §2.4 step 3). Re-checks the permission, then trusts nothing the browser said: the object's
 * size and ETag come from R2 (HEAD), its first 64 KiB (and for 3MF its last 64 KiB) are checked against the type's
 * signature, the quota is recomputed at write time inside the batch guard, and the new file (or the snapshot of the old
 * version plus the new current one) is written together with the session's completion. A mismatching or unsupported
 * object is rejected and queued for deletion. Calling it again for a completed session returns the same file.
 */
export const completeUpload = Effect.fn('completeUpload')(function* (caller: Caller, input: { readonly uploadId: string; readonly etag: string }) {
  const session = yield* loadSession(caller.userId, input.uploadId)
  if (session.status === 'completed') return yield* uploadedFile(session)
  const now = yield* nowSeconds
  if (session.status !== 'pending' || toSeconds(session.expiresAt) <= now) return yield* new UploadUnavailable()

  const access = yield* authorizeUpload(caller, session.workspaceId, { projectId: session.targetFileId === null ? session.projectId : null, fileId: session.targetFileId }, now)
  const limits = yield* (yield* Entitlements).limits(session.workspaceId)
  const storage = yield* Storage
  const db = yield* Db

  const head = yield* storage.head(session.r2Key)
  if (Option.isNone(head)) return yield* new UploadIncomplete()
  const etag = normalizeEtag(head.value.etag)
  if (head.value.size !== session.declaredSize || normalizeEtag(input.etag) !== etag) return yield* reject(session, now, new UploadMismatch())
  if (session.declaredSize > limits.maxFileBytes) return yield* reject(session, now, new FileTooLarge())

  const type = fileTypeOfExtension(session.extension)
  if (type === undefined) return yield* reject(session, now, new UnsupportedFileType())
  const sampleLength = Math.min(session.declaredSize, SIGNATURE_BYTES)
  const first = yield* storage.getRange(session.r2Key, { offset: 0, length: sampleLength })
  const last = signatureNeedsTail(type.id) ? yield* storage.getRange(session.r2Key, { suffix: sampleLength }) : Option.none()
  if (Option.isNone(first) || (signatureNeedsTail(type.id) && Option.isNone(last))) return yield* new UploadIncomplete()
  // The object changed between HEAD and the reads (it cannot with a one-shot URL, but verify rather than assume).
  if (normalizeEtag(first.value.etag) !== etag || (Option.isSome(last) && normalizeEtag(last.value.etag) !== etag)) {
    return yield* reject(session, now, new UploadMismatch())
  }
  const valid = hasValidSignature(type.id, {
    size: session.declaredSize,
    head: yield* readBytes(session.r2Key, first.value),
    tail: Option.isSome(last) ? yield* readBytes(session.r2Key, last.value) : undefined,
  })
  if (!valid) return yield* reject(session, now, new UnsupportedFileType())

  if ((yield* usedBytes(session.workspaceId, now, session.id)) + session.declaredSize > limits.storageBytes) {
    return yield* reject(session, now, new StorageQuotaExceeded())
  }

  const guardConditions = (extra: ReadonlyArray<ReturnType<typeof sql>>) =>
    sql.join([
      sessionPending(session.id, now),
      stillRole(session.workspaceId, caller.userId, [access.role]),
      fitsQuota(session.workspaceId, now, session.id, session.declaredSize, limits.storageBytes),
      ...(access.projectId !== null && access.projectMode !== null ? [projectStill(access.projectId, access.projectMode)] : []),
      ...extra,
    ], sql` AND `)
  const at = toDate(now)
  const activityId = yield* newUlid
  const done = { status: 'completed', completedAt: at } as const

  const write = access.file === null
    ? runBatch((d) => [
      guard(d, guardConditions([])),
      d.insert(schema.files).values({
        id: session.fileId, name: session.name, r2Key: session.r2Key, size: session.declaredSize, mimeType: type.mimeType,
        extension: session.extension, status: 'uploaded', userId: caller.userId, createdAt: at, updatedAt: at,
        workspaceId: session.workspaceId, projectId: session.projectId, contentEtag: etag, currentVersionNumber: 1,
        currentUploadedByUserId: caller.userId,
      }),
      // Only internal roles can upload; the uploader keeps `edit` on the file as long as their membership lives (docs/08 §4).
      d.insert(schema.fileAccess).values({
        workspaceId: session.workspaceId, fileId: session.fileId, userId: caller.userId, level: 'edit', expiresAt: null,
        grantedByUserId: caller.userId, source: 'uploader', createdAt: at, updatedAt: at,
      }),
      d.update(schema.uploadSessions).set(done).where(eq(schema.uploadSessions.id, session.id)),
      activity(d, { workspaceId: session.workspaceId, caller, targetKind: 'file', targetId: session.fileId, action: 'file.uploaded', at: now }, activityId),
    ])
    : Effect.gen(function* () {
      const current = access.file
      // NULL currentVersionNumber is a legacy row: its number is COUNT(file_versions) + 1 (docs/09 §1.4).
      const counted = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT count(*) AS n FROM file_versions WHERE fileId = ${current.id}`))
      const versions = counted?.n ?? 0
      const currentNumber = current.currentVersionNumber ?? versions + 1
      const snapshotId = yield* newUlid
      return yield* runBatch((d) => [
        guard(d, guardConditions([
          sql`EXISTS (SELECT 1 FROM files WHERE id = ${current.id} AND workspaceId = ${session.workspaceId} AND isDeleted = 0
            AND r2Key = ${current.r2Key} AND currentVersionNumber IS ${current.currentVersionNumber})`,
          sql`(SELECT count(*) FROM file_versions WHERE fileId = ${current.id}) = ${versions}`,
        ])),
        d.insert(schema.fileVersions).values({
          id: snapshotId, fileId: current.id, versionNumber: currentNumber, r2Key: current.r2Key, size: current.size,
          uploadedByUserId: current.currentUploadedByUserId ?? current.userId, createdAt: at,
          contentEtag: current.contentEtag, thumbnailR2Key: current.thumbnailR2Key,
        }),
        d.update(schema.files).set({
          r2Key: session.r2Key, size: session.declaredSize, contentEtag: etag, currentVersionNumber: currentNumber + 1,
          currentUploadedByUserId: caller.userId, thumbnailR2Key: null, updatedAt: at,
        }).where(and(eq(schema.files.id, current.id), eq(schema.files.workspaceId, session.workspaceId))),
        d.update(schema.uploadSessions).set(done).where(eq(schema.uploadSessions.id, session.id)),
        activity(d, { workspaceId: session.workspaceId, caller, targetKind: 'file', targetId: current.id, action: 'file.version_uploaded', at: now }, activityId),
      ])
    })

  yield* write.pipe(
    // A concurrent call may have completed this very session (same result), taken the space (reject) or moved the file's
    // version (retry); anything else is a plain conflict the client may retry.
    Effect.catchTag('WriteConflict', (conflict) =>
      Effect.gen(function* () {
        const latest = yield* loadSession(caller.userId, session.id)
        if (latest.status === 'completed') return
        if (latest.status !== 'pending') return yield* new UploadUnavailable()
        if ((yield* usedBytes(session.workspaceId, now, session.id)) + session.declaredSize > limits.storageBytes) {
          return yield* reject(session, now, new StorageQuotaExceeded())
        }
        return yield* conflict
      }),
    ),
  )
  return yield* uploadedFile(session)
})

/**
 * Gives up an upload the user started. The reservation is released and the object, if the browser already sent it, is
 * queued for deletion in the same batch.
 */
export const cancelUpload = Effect.fn('cancelUpload')(function* (caller: Caller, input: { readonly uploadId: string }) {
  const session = yield* loadSession(caller.userId, input.uploadId)
  if (session.status !== 'pending') return yield* new UploadUnavailable()
  const now = yield* nowSeconds
  yield* runBatch((d) => [
    guard(d, sql`EXISTS (SELECT 1 FROM upload_sessions WHERE id = ${session.id} AND status = 'pending')`),
    d.update(schema.uploadSessions).set({ status: 'expired' }).where(eq(schema.uploadSessions.id, session.id)),
    enqueueDeletion(d, session.r2Key, 'upload_canceled', now),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new UploadUnavailable())))
  yield* drainStorageDeletions({ keys: [session.r2Key] }).pipe(Effect.ignore)
})
