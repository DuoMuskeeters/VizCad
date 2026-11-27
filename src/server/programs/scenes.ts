/**
 * Scene records (docs/11 §3): names, colours, finishes, hidden nodes and saved views of one model of a file, kept in
 * D1 beside it; the GLB and the source never change. Read with `preview` (every level, D23), written with `edit`.
 * Optimistic concurrency: every write names the revision it was made on; another one is `SceneConflict`.
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { Effect, Option, Schema } from 'effect'
import * as schema from '../db/schema'
import { type DerivativeColumns, readyDerivative } from '../derivative'
import { PayloadTooLarge, PreviewUnavailable, SceneConflict, ValidationError, VersionChanged } from '../errors'
import { StoredScene, type SceneBody } from '../scene'
import { fileTypeOfExtension, hasDerivative } from '../../shared/fileTypes'
import { EMPTY_SCENE, SCENE_MAX_BODY, type SceneAnswer } from '../../shared/scene'
import { type Database, Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { authorizeDelivery, workspaceOfFile } from './delivery'
import { can, currentVersionOf, openFile } from './fileContext'
import { guard, newUlid, runBatch, stillRole, toDate, toSeconds, type Caller } from './shared'

/** `scene.updated` goes into the activity at most this often per file (§3.1: not every colour change). */
export const SCENE_ACTIVITY_SECONDS = 10 * 60

type KeyColumns = DerivativeColumns & { readonly r2Key: string }

/**
 * The object whose node paths a scene of the current version refers to: the ready GLB of a STEP/IGES/3MF, the source of
 * an STL/OBJ/PLY. A STEP still without a GLB (converted in place) has none: its scene can be written once the GLB is stored.
 */
export const sceneModelKey = (row: KeyColumns): string | null => {
  const type = fileTypeOfExtension(row.extension)
  if (type === undefined) return null
  if (!hasDerivative(type.id)) return row.r2Key
  return readyDerivative(row)?.key ?? null
}

const bodyOf = (text: string): SceneBody => Option.getOrElse(Schema.decodeUnknownOption(StoredScene)(text), () => EMPTY_SCENE as SceneBody)

/** The file and the caller's `preview` on it; `edit` decided too. */
const openForScene = Effect.fnUntraced(function* (caller: Caller, fileId: string) {
  const workspaceId = yield* workspaceOfFile(fileId)
  const opened = yield* openFile(caller, workspaceId, fileId)
  yield* authorizeDelivery(opened.base, { kind: 'preview' })
  return { ...opened, workspaceId, key: sceneModelKey(opened.file), canEdit: can(opened.base, { kind: 'edit' }) }
})

/**
 * `GET /api/files/{id}/scene`. This model's record; when it has none and the caller may write, the newest record of an
 * earlier model of the file (a previous version or a rebuilt GLB) with its version number, for the "apply the previous
 * colours" banner (§3.3). Readers who may not write never see an earlier record.
 */
export const getScene = Effect.fn('getScene')(function* (caller: Caller, input: { readonly fileId: string }) {
  const { file, key, canEdit, workspaceId, role } = yield* openForScene(caller, input.fileId)
  const { savedViewsPerScene } = yield* (yield* Entitlements).limits(workspaceId)
  const answer = (rest: Pick<SceneAnswer, 'scene' | 'previous'>): SceneAnswer => ({ ...rest, canEdit: canEdit && key !== null, maxViews: savedViewsPerScene })
  if (key === null) return answer({ scene: null, previous: null })
  const db = yield* Db
  const s = schema.fileScenes
  const rows = yield* db.use((d) =>
    d.select({ revision: s.revision, body: s.body, updatedAt: s.updatedAt, name: schema.user.name }).from(s)
      .leftJoin(schema.user, eq(schema.user.id, s.updatedByUserId))
      .where(and(eq(s.fileId, file.id), eq(s.modelR2Key, key))).limit(1),
  )
  const row = rows[0]
  // A guest sees the record, not who in the workspace wrote it.
  if (row !== undefined) return answer({ scene: { revision: row.revision, body: bodyOf(row.body), updatedAt: toSeconds(row.updatedAt), updatedBy: role === 'guest' ? null : row.name }, previous: null })
  if (!canEdit) return answer({ scene: null, previous: null })
  const earlier = yield* db.use((d) =>
    d.select({ body: s.body, key: s.modelR2Key }).from(s)
      .where(and(eq(s.fileId, file.id), ne(s.modelR2Key, key))).orderBy(desc(s.updatedAt), desc(s.id)).limit(1),
  )
  const before = earlier[0]
  if (before === undefined) return answer({ scene: null, previous: null })
  const body = bodyOf(before.body)
  if (Object.keys(body.nodes).length === 0) return answer({ scene: null, previous: null })
  const version = yield* db.use((d) =>
    d.get<{ n: number } | undefined>(sql`SELECT max(versionNumber) AS n FROM file_versions WHERE fileId = ${file.id} AND (derivativeR2Key = ${before.key} OR r2Key = ${before.key})`),
  )
  return answer({ scene: null, previous: { body, versionNumber: version?.n ?? null } })
})

/** The file still has this model (same source, same GLB), untrashed and in place. Evaluated in the batch. */
const onModel = (fileId: string, r2Key: string, derivativeR2Key: string | null) =>
  sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND r2Key = ${r2Key} AND derivativeR2Key IS ${derivativeR2Key})`

/**
 * Records of models the file no longer has (neither the current version nor a snapshot holds the key): nothing will
 * match from them any more. The current key is never pruned; an earlier version's record stays a matching source.
 */
const pruneStale = (d: Database, fileId: string, keep: string) =>
  d.delete(schema.fileScenes).where(and(
    eq(schema.fileScenes.fileId, fileId),
    ne(schema.fileScenes.modelR2Key, keep),
    sql`NOT EXISTS (SELECT 1 FROM files f WHERE f.id = ${fileId} AND (f.r2Key = file_scenes.modelR2Key OR f.derivativeR2Key = file_scenes.modelR2Key))`,
    sql`NOT EXISTS (SELECT 1 FROM file_versions v WHERE v.fileId = ${fileId} AND (v.r2Key = file_scenes.modelR2Key OR v.derivativeR2Key = file_scenes.modelR2Key))`,
  ))

/**
 * `PUT /api/files/{id}/scene { version, revision, body }` (docs/11 §3.1). `edit`; `version` is the version the editor
 * has open (another one: `VersionChanged`); `revision` is the record's revision it was made on, 0 for none yet.
 * A stale revision is `SceneConflict`, nothing is written. Saved views at most `savedViewsPerScene`, the stored text at
 * most 128 KiB. Activity `scene.updated` at most once in ten minutes per file.
 */
type SceneWrite = { readonly fileId: string; readonly version: number; readonly revision: number; readonly body: SceneBody }

/** One write; `'retry'` when the caller's role changed meanwhile but still allows editing. */
const writeSceneOnce = Effect.fnUntraced(function* (caller: Caller, input: SceneWrite) {
  const { file, key, role, still, workspaceId, base } = yield* openForScene(caller, input.fileId)
  yield* authorizeDelivery(base, { kind: 'edit' })
  if ((yield* currentVersionOf(file)) !== input.version) return yield* new VersionChanged()
  if (key === null) return yield* new PreviewUnavailable()
  const { savedViewsPerScene } = yield* (yield* Entitlements).limits(workspaceId)
  if (input.body.views.length > savedViewsPerScene) return yield* new ValidationError({ message: 'too many saved views' })
  const text = JSON.stringify(input.body)
  if (text.length > SCENE_MAX_BODY) return yield* new PayloadTooLarge()

  const now = base.now
  const next = input.revision + 1
  const s = schema.fileScenes
  const recordCondition = input.revision === 0
    ? sql`NOT EXISTS (SELECT 1 FROM file_scenes WHERE fileId = ${file.id} AND modelR2Key = ${key})`
    : sql`EXISTS (SELECT 1 FROM file_scenes WHERE fileId = ${file.id} AND modelR2Key = ${key} AND revision = ${input.revision})`
  const id = yield* newUlid
  const activityId = yield* newUlid
  const written = yield* runBatch((d) => [
    guard(d, sql.join([stillRole(workspaceId, caller.userId, [role]), still(false), onModel(file.id, file.r2Key, file.derivativeR2Key), recordCondition], sql` AND `)),
    input.revision === 0
      ? d.insert(s).values({ id, workspaceId, fileId: file.id, modelR2Key: key, revision: 1, body: text, updatedByUserId: caller.userId, updatedAt: toDate(now) })
      : d.update(s).set({ revision: next, body: text, updatedByUserId: caller.userId, updatedAt: toDate(now) })
        .where(and(eq(s.fileId, file.id), eq(s.modelR2Key, key), eq(s.revision, input.revision))),
    pruneStale(d, file.id, key),
    d.insert(schema.accessLog).select(sql`SELECT ${activityId}, ${workspaceId}, 'user', ${caller.userId}, NULL, 'file', ${file.id}, 'scene.updated',
      'allowed', ${caller.requestId}, ${now}, NULL
      WHERE NOT EXISTS (SELECT 1 FROM access_log WHERE workspaceId = ${workspaceId} AND targetKind = 'file' AND targetId = ${file.id}
        AND action = 'scene.updated' AND createdAt > ${now - SCENE_ACTIVITY_SECONDS})`),
  ], [['file_scenes_file_model_uq', () => new SceneConflict()]]).pipe(
    Effect.catchTag('WriteConflict', () =>
      // The guard does not say which part failed. Opened again: a trashed or moved file, a lost edit right and a new
      // model (version, GLB) each answer with their own error; a role that changed but still edits writes once more;
      // what is left is a stale revision.
      Effect.gen(function* () {
        const again = yield* openForScene(caller, input.fileId)
        yield* authorizeDelivery(again.base, { kind: 'edit' })
        if (again.file.r2Key !== file.r2Key || again.file.derivativeR2Key !== file.derivativeR2Key) return yield* new VersionChanged()
        if (again.role !== role) return 'retry' as const
        return yield* new SceneConflict()
      })),
  )
  if (written === 'retry') return written
  return { revision: input.revision === 0 ? 1 : next, updatedAt: now }
})

export const putScene = Effect.fn('putScene')(function* (caller: Caller, input: SceneWrite) {
  const first = yield* writeSceneOnce(caller, input)
  if (first !== 'retry') return first
  // Written once more under the new role; a second change of role in between is reported as a conflict.
  const second = yield* writeSceneOnce(caller, input)
  return second === 'retry' ? yield* new SceneConflict() : second
})
