import { and, eq, sql } from 'drizzle-orm'
import { Effect, Option } from 'effect'
import * as schema from '../db/schema'
import { ContentIntegrity, InvalidThumbnail, PreviewUnavailable, ResourceUnavailable, ValidationError, VersionChanged, VersionUnavailable } from '../errors'
import { contentHeaders, imageContentType, type ImageKind, MAX_THUMBNAIL_BYTES, parseRange, rangeNotSatisfiableHeaders, sniffImage, thumbnailHeaders } from '../deliveryHttp'
import type { PermissionAction, PermissionInput } from '../permissions'
import { validateThumbnail } from '../thumbnail'
import { type DerivativeColumns, modelKind, readyDerivative } from '../derivative'
import { Db } from '../services/Db'
import { RateLimit } from '../services/RateLimit'
import { readBytes, Storage } from '../services/Storage'
import { objectKey } from './uploads'
import { recordDenied, recordDelivery } from './audit'
import { can, currentVersionOf, openFile } from './fileContext'
import { enqueueDeletion } from './storageCleanup'
import { authorize, type Caller, guard, newUlid, opt, runBatch, stillRole, toDate, traceOf, type Trace } from './shared'

/** What the HTTP layer sends: a status, headers, and the bytes (a stream for content, bytes for a thumbnail). */
export interface Delivery {
  readonly status: 200 | 206 | 416
  readonly headers: Readonly<Record<string, string>>
  readonly body: ReadableStream<Uint8Array> | Uint8Array | null
}

/** The stored object a delivery is about, as D1 recorded it. */
export interface StoredObject {
  readonly key: string
  readonly size: number
  /** NULL for legacy objects: the ETag comparison is skipped and the size still compared (docs/09 §1.4). */
  readonly etag: string | null
}

/** Cancels a body that will not be sent, so R2 does not keep the stream open. */
const discard = (body: ReadableStream<Uint8Array>) => Effect.promise(() => body.cancel().catch(() => undefined))

/**
 * Streams a stored object from R2 through the Worker (docs/09 §3.1): the Range header is resolved against the recorded
 * size, the read is conditional on the recorded ETag (`onlyIf`), and the object's real size must equal the recorded one.
 * The body is the R2 stream itself, never copied. A missing object, a changed ETag or a different size is a
 * ContentIntegrity failure and nothing is delivered.
 */
export const streamContent = Effect.fnUntraced(function* (input: {
  readonly object: StoredObject
  readonly name: string
  readonly range: string | null
  readonly extraHeaders?: Readonly<Record<string, string>>
}) {
  const range = parseRange(input.range, input.object.size)
  if (range.kind === 'unsatisfiable') {
    return { status: 416, headers: { ...rangeNotSatisfiableHeaders(input.object.size), ...input.extraHeaders }, body: null } satisfies Delivery
  }
  const storage = yield* Storage
  const opened = yield* storage.get(input.object.key, {
    ...(range.kind === 'partial' ? { range: { offset: range.start, length: range.end - range.start + 1 } } : {}),
    ...(input.object.etag === null ? {} : { onlyIf: { etagMatches: input.object.etag } }),
  })
  if (Option.isNone(opened)) return yield* new ContentIntegrity()
  if (opened.value.size !== input.object.size) {
    yield* discard(opened.value.body)
    return yield* new ContentIntegrity()
  }
  return {
    status: range.kind === 'partial' ? 206 : 200,
    headers: { ...contentHeaders(input.name, input.object.size, range), ...input.extraHeaders },
    body: opened.value.body,
  } satisfies Delivery
})

/**
 * Serves a thumbnail only if its bytes are PNG or WebP (by magic) and at most 1 MiB; the response type is the sniffed
 * one, never what the object claims. Anything else is PreviewUnavailable, as if there were no thumbnail.
 */
export const streamThumbnail = Effect.fnUntraced(function* (key: string, extraHeaders: Readonly<Record<string, string>> = {}) {
  const storage = yield* Storage
  const opened = yield* storage.get(key)
  if (Option.isNone(opened)) return yield* new PreviewUnavailable()
  if (opened.value.size > MAX_THUMBNAIL_BYTES) {
    yield* discard(opened.value.body)
    return yield* new PreviewUnavailable()
  }
  const bytes = yield* readBytes(key, opened.value)
  const kind = sniffImage(bytes)
  if (kind === undefined || bytes.byteLength > MAX_THUMBNAIL_BYTES) return yield* new PreviewUnavailable()
  return { status: 200, headers: { ...thumbnailHeaders(kind, bytes.byteLength), ...extraHeaders }, body: bytes } satisfies Delivery
})

/** The workspace of an uploaded file, found by id alone: delivery URLs carry only the file id. */
export const workspaceOfFile = Effect.fnUntraced(function* (fileId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({ workspaceId: schema.files.workspaceId }).from(schema.files)
      .where(and(eq(schema.files.id, fileId), eq(schema.files.status, 'uploaded'))).limit(1),
  )
  const workspaceId = rows[0]?.workspaceId
  if (workspaceId === undefined || workspaceId === null) return yield* new ResourceUnavailable()
  return workspaceId
})

type FileRow = typeof schema.files.$inferSelect

/**
 * permissions.ts for a delivery action. A caller who may not even `view` the file gets the same 404 as a missing one
 * (a guest without a grant must not learn that a file id exists); a caller who may view it gets the real denial.
 */
export const authorizeDelivery = (base: Omit<PermissionInput, 'action'>, action: PermissionAction, version?: PermissionInput['version']) =>
  authorize({ ...base, ...opt('version', version), action }).pipe(
    Effect.catchTag('PermissionDenied', (denied) => Effect.fail(can(base, { kind: 'view' }) ? denied : new ResourceUnavailable())),
  )

/** `current`, or a `file_versions` id of this file. */
const versionOf = Effect.fnUntraced(function* (file: FileRow, version: string) {
  if (version === 'current') {
    return { object: { key: file.r2Key, size: file.size, etag: file.contentEtag } satisfies StoredObject, thumbnailKey: file.thumbnailR2Key, version: undefined }
  }
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.fileVersions).where(and(eq(schema.fileVersions.id, version), eq(schema.fileVersions.fileId, file.id))).limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new VersionUnavailable()
  return {
    object: { key: row.r2Key, size: row.size, etag: row.contentEtag } satisfies StoredObject,
    thumbnailKey: row.thumbnailR2Key,
    version: { id: row.id, fileId: file.id, ready: true },
  }
})

/** A failed integrity check is one of the two refusals the access log keeps (docs/09 §7.1). Best effort: the 409 stands either way. */
const noteIntegrity = (audit: { workspaceId: string; fileId: string; userId: string; trace: Trace; now: number; action: 'file.downloaded' | 'file.previewed' }) =>
  <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tapError((error) =>
        error._tag !== 'ContentIntegrity' ? Effect.void : Effect.logWarning('delivery integrity check failed').pipe(
          Effect.annotateLogs({ requestId: audit.trace.requestId }),
          Effect.andThen(recordDenied({
            workspaceId: audit.workspaceId, actor: { kind: 'user', userId: audit.userId }, fileId: audit.fileId, action: audit.action,
            reason: 'integrity', security: false, trace: audit.trace, now: audit.now,
          })),
          Effect.ignore,
        )),
    )

/**
 * `GET /api/files/{fileId}/content?v=`: the file's bytes for a member (docs/09 §3.1). Permission `download` (an older
 * version also needs `viewHistory`), then the audit row, then the stream. `version` is `current` or a version id.
 */
export const deliverContent = Effect.fn('deliverContent')(function* (
  caller: Caller,
  input: { readonly fileId: string; readonly version: string; readonly range: string | null },
) {
  const workspaceId = yield* workspaceOfFile(input.fileId)
  const { base, file } = yield* openFile(caller, workspaceId, input.fileId)
  const target = yield* versionOf(file, input.version)
  if (target.version !== undefined) yield* authorizeDelivery(base, { kind: 'viewHistory' })
  yield* authorizeDelivery(base, { kind: 'download' }, target.version)
  const trace = traceOf(caller)
  yield* recordDelivery({ workspaceId, actor: { kind: 'user', userId: caller.userId }, fileId: file.id, objectKey: target.object.key, purpose: 'download', trace, now: base.now })
  return yield* streamContent({ object: target.object, name: file.name, range: input.range }).pipe(
    noteIntegrity({ workspaceId, fileId: file.id, userId: caller.userId, trace, now: base.now, action: 'file.downloaded' }),
  )
})

/** The derivative's MIME type (docs/11 §2.4); the source keeps `application/octet-stream`. */
export const GLB_CONTENT_TYPE = 'model/gltf-binary'

/** `Bracket.step` -> `Bracket.glb`: the derivative is saved under its own extension if someone keeps the response. */
const glbName = (name: string) => {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.glb`
}

/** The row fields `GET …/model` decides on and streams from (a `files` row, or the file part of a link's row). */
export type ModelRow = DerivativeColumns & { readonly r2Key: string; readonly contentEtag: string | null; readonly name: string }

/** What `model` will stream for this caller (D23), resolved before the audit row: the object and its name. */
export const modelTarget = (row: ModelRow, canDownload: boolean) => {
  const kind = modelKind(row, canDownload)
  if (kind === 'none') return undefined
  const glb = kind === 'derivative' ? readyDerivative(row) : undefined
  return glb === undefined
    ? { kind: 'source' as const, object: { key: row.r2Key, size: row.size, etag: row.contentEtag } satisfies StoredObject, name: row.name }
    : { kind: 'derivative' as const, object: { key: glb.key, size: glb.size, etag: glb.etag } satisfies StoredObject, name: glbName(row.name) }
}

/** Streams a resolved model target: `content`'s headers and Range, with the GLB type for a derivative. */
export const streamModel = Effect.fnUntraced(function* (
  target: NonNullable<ReturnType<typeof modelTarget>>,
  range: string | null,
  extraHeaders: Readonly<Record<string, string>> = {},
) {
  const delivery = yield* streamContent({ object: target.object, name: target.name, range, extraHeaders })
  if (target.kind === 'source' || delivery.status === 416) return delivery
  return { ...delivery, headers: { ...delivery.headers, 'content-type': GLB_CONTENT_TYPE } } satisfies Delivery
})

/**
 * `GET /api/files/{fileId}/model`: what the 3D viewer reads (docs/11 §2.4, D23). Always the current version, permission
 * `preview` (every level, view and comment included). STEP/IGES/3MF answer with the GLB derivative
 * (`model/gltf-binary`); without one, only a caller who may also download gets the source (the viewer converts it in
 * place), everyone else `PreviewUnavailable`. STL/OBJ/PLY answer with the source itself. Same headers and Range as
 * `content`, audited as `file.previewed` (no security-log download event): opening the viewer is not a download.
 */
export const deliverModel = Effect.fn('deliverModel')(function* (caller: Caller, input: { readonly fileId: string; readonly range: string | null }) {
  const workspaceId = yield* workspaceOfFile(input.fileId)
  const { base, file } = yield* openFile(caller, workspaceId, input.fileId)
  yield* authorizeDelivery(base, { kind: 'preview' })
  const target = modelTarget(file, can(base, { kind: 'download' }))
  if (target === undefined) return yield* new PreviewUnavailable()
  const trace = traceOf(caller)
  yield* recordDelivery({ workspaceId, actor: { kind: 'user', userId: caller.userId }, fileId: file.id, objectKey: target.object.key, purpose: 'preview', trace, now: base.now })
  return yield* streamModel(target, input.range).pipe(
    noteIntegrity({ workspaceId, fileId: file.id, userId: caller.userId, trace, now: base.now, action: 'file.previewed' }),
  )
})

/**
 * `GET /api/files/{fileId}/thumbnail?v=`: the thumbnail for anyone who may `preview` the file (view level suffices).
 * Members' own thumbnails are list furniture and are not audited; a guest's are (a guest sees only what was shared).
 */
export const deliverThumbnail = Effect.fn('deliverThumbnail')(function* (caller: Caller, input: { readonly fileId: string; readonly version: string }) {
  const workspaceId = yield* workspaceOfFile(input.fileId)
  const { base, file, role } = yield* openFile(caller, workspaceId, input.fileId)
  const target = yield* versionOf(file, input.version)
  if (target.version !== undefined) yield* authorizeDelivery(base, { kind: 'viewHistory' })
  yield* authorizeDelivery(base, { kind: 'preview' }, target.version)
  if (target.thumbnailKey === null) return yield* new PreviewUnavailable()
  if (role === 'guest') {
    yield* recordDelivery({
      workspaceId, actor: { kind: 'user', userId: caller.userId }, fileId: file.id, objectKey: target.thumbnailKey, purpose: 'preview', trace: traceOf(caller), now: base.now,
    })
  }
  return yield* streamThumbnail(target.thumbnailKey)
})

/**
 * `POST /api/files/{fileId}/thumbnail`: stores a thumbnail for the current version (docs/09 §3.1). Needs `edit`. The bytes
 * must parse as a PNG or WebP within 1024×1024 and 1 MiB and match the declared type. The Worker writes the object under
 * a fresh server-made key; the batch then points the file at it, guarded against the file having changed meanwhile
 * (a new version, the trash), and queues the replaced thumbnail key (the cleanup worker keeps any key a version row still holds).
 * `expectedVersion` is the number the browser rendered from: a version that landed since then is `VersionChanged`, so an
 * old version's image never sits on a new one, whichever tab or person uploaded it.
 */
export const putThumbnail = Effect.fn('putThumbnail')(function* (
  caller: Caller,
  input: {
    readonly fileId: string
    readonly version: string
    /** The version number the image was rendered from; another current number is `VersionChanged` (docs/11 5a note). */
    readonly expectedVersion: number
    readonly contentType: string | null
    readonly bytes: Uint8Array
  },
) {
  if (input.version !== 'current') return yield* new ValidationError({ message: 'only the current version takes a thumbnail' })
  const workspaceId = yield* workspaceOfFile(input.fileId)
  const { base, file, role, still } = yield* openFile(caller, workspaceId, input.fileId)
  yield* authorizeDelivery(base, { kind: 'edit' })
  if ((yield* currentVersionOf(file)) !== input.expectedVersion) return yield* new VersionChanged()
  yield* (yield* RateLimit).hit({ action: 'thumbnailPut', target: caller.userId, ip: caller.ip })
  if (input.bytes.byteLength > MAX_THUMBNAIL_BYTES) return yield* new InvalidThumbnail()
  const kind: ImageKind | undefined = validateThumbnail(input.bytes, input.contentType)
  if (kind === undefined) return yield* new InvalidThumbnail()

  const key = `${objectKey(workspaceId, file.id, yield* newUlid)}.thumb`
  const storage = yield* Storage
  yield* storage.put(key, input.bytes, { contentType: imageContentType(kind) })
  const at = toDate(base.now)
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(workspaceId, caller.userId, [role])} AND ${still(false)} AND EXISTS (
      SELECT 1 FROM files WHERE id = ${file.id} AND r2Key = ${file.r2Key})`),
    d.update(schema.files).set({ thumbnailR2Key: key, updatedAt: at }).where(and(eq(schema.files.id, file.id), eq(schema.files.r2Key, file.r2Key))),
    ...(file.thumbnailR2Key === null ? [] : [enqueueDeletion(d, file.thumbnailR2Key, 'purged', base.now)]),
  ]).pipe(
    // The new object is unreferenced if the batch did not run; remove it (best effort, the queue is not involved).
    Effect.tapError(() => storage.delete([key]).pipe(Effect.ignore)),
  )
  return { thumbnailAvailable: true }
})
