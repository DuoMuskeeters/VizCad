import { and, desc, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { VersionUnavailable } from '../errors'
import type { VersionEntry } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { openFile, personOf, summarySelect } from './fileContext'
import { activity, authorize, type Caller, guard, newUlid, runBatch, snapshotCurrentVersion, stillRole, toDate, toSeconds } from './shared'

/** The version history, newest first: the current version as `current`, then the snapshots (docs/09 §5.2). Internal roles only. */
export const listVersions = Effect.fn('listVersions')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'viewHistory' } })
  const db = yield* Db
  const [summary, snapshots] = yield* db.use((d) =>
    Promise.all([
      summarySelect(d, caller.userId, base.now).where(eq(schema.files.id, file.id)).limit(1),
      d.select({
        id: schema.fileVersions.id, number: schema.fileVersions.versionNumber, size: schema.fileVersions.size,
        createdAt: schema.fileVersions.createdAt, thumb: schema.fileVersions.thumbnailR2Key, uploader: schema.user.name,
      }).from(schema.fileVersions)
        .leftJoin(schema.user, eq(schema.user.id, schema.fileVersions.uploadedByUserId))
        .where(eq(schema.fileVersions.fileId, file.id))
        .orderBy(desc(schema.fileVersions.versionNumber), desc(schema.fileVersions.createdAt), desc(schema.fileVersions.id)),
    ]),
  )
  const row = summary[0]
  const current: VersionEntry = {
    id: 'current', number: row?.versionNumber ?? 1, size: file.size, uploadedBy: personOf(row?.uploaderName ?? null),
    createdAt: toSeconds(file.updatedAt), thumbnailAvailable: file.thumbnailR2Key !== null,
  }
  return {
    current,
    versions: snapshots.map((v): VersionEntry => ({
      id: v.id, number: v.number, size: v.size, uploadedBy: personOf(v.uploader), createdAt: toSeconds(v.createdAt), thumbnailAvailable: v.thumb !== null,
    })),
  }
})

/**
 * Makes an older version current again (docs/09 §5.2). History is never dropped: the current state is first saved as a
 * snapshot, then the chosen version's object becomes the file's current one under a new, higher number. The same R2 key
 * may now sit in a `files` row and a `file_versions` row; no reference is lost, so nothing is queued for deletion.
 * Needs `uploadVersion` (edit). The batch guards the file's current key and version number and the version's row, so a
 * competing upload or restore makes this call fail with `WriteConflict`.
 */
export const restoreVersion = Effect.fn('restoreVersion')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly versionId: string },
) {
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'uploadVersion' } })
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select().from(schema.fileVersions).where(and(eq(schema.fileVersions.id, input.versionId), eq(schema.fileVersions.fileId, file.id))).limit(1),
  )
  const version = found[0]
  if (version === undefined) return yield* new VersionUnavailable()
  const counted = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT count(*) AS n FROM file_versions WHERE fileId = ${file.id}`))
  const versions = counted?.n ?? 0
  // NULL currentVersionNumber is a legacy row: COUNT(file_versions) + 1 (docs/09 §1.4).
  const currentNumber = file.currentVersionNumber ?? versions + 1
  const snapshotId = yield* newUlid
  const activityId = yield* newUlid
  const at = toDate(base.now)
  yield* runBatch((d) => [
    guard(d, sql.join([
      stillRole(input.workspaceId, caller.userId, [role]),
      still(false),
      sql`EXISTS (SELECT 1 FROM files WHERE id = ${file.id} AND r2Key = ${file.r2Key} AND currentVersionNumber IS ${file.currentVersionNumber})`,
      sql`(SELECT count(*) FROM file_versions WHERE fileId = ${file.id}) = ${versions}`,
      sql`EXISTS (SELECT 1 FROM file_versions WHERE id = ${version.id} AND fileId = ${file.id} AND r2Key = ${version.r2Key})`,
    ], sql` AND `)),
    snapshotCurrentVersion(d, { snapshotId, fileId: file.id, r2Key: file.r2Key, versionNumber: currentNumber, at: base.now }),
    // The restored version brings its own thumbnail and derivative back (the same keys now sit in two rows). A GLB
    // completed later for this source repoints every row of it (`completeDerivative`), so GLBs do not pile up per restore.
    d.update(schema.files).set({
      r2Key: version.r2Key, size: version.size, contentEtag: version.contentEtag, thumbnailR2Key: version.thumbnailR2Key,
      derivativeR2Key: version.derivativeR2Key, derivativeState: version.derivativeState, derivativeMeta: version.derivativeMeta,
      currentVersionNumber: currentNumber + 1, currentUploadedByUserId: version.uploadedByUserId, updatedAt: at,
    }).where(and(eq(schema.files.id, file.id), eq(schema.files.workspaceId, input.workspaceId))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'file.version_restored', at: base.now }, activityId),
  ])
  return { fileId: file.id, versionNumber: currentNumber + 1 }
})
