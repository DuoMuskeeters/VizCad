import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { ValidationError } from '../errors'
import { decidePermission } from '../permissions'
import type { TrashItem } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { fileGrantsOf, loadScope, openFile, personOf, scopedInput } from './fileContext'
import { drainStorageDeletions } from './storageCleanup'
import {
  activity, authorize, type Caller, guard, newUlid, nowSeconds, runBatch, stillRole, toDate,
} from './shared'

const DAY = 24 * 60 * 60

/** A unique, language-neutral `name (2).ext` (then 3, 4, ...) for a restored file whose name is taken at its old place. */
const suffixOf = (name: string, extension: string) => name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? name.slice(name.length - extension.length - 1) : ''
const stemOf = (name: string, extension: string) => name.slice(0, name.length - suffixOf(name, extension).length)

export const restoredName = (name: string, extension: string, taken: ReadonlySet<string>) => {
  const suffix = suffixOf(name, extension)
  const stem = stemOf(name, extension)
  let n = 2
  while (taken.has(`${stem} (${n})${suffix}`)) n++
  return `${stem} (${n})${suffix}`
}

/**
 * Moves a file to the trash. In the same batch its active links are revoked (the revision moves on, so old cookies die)
 * and its pending external invitations are canceled. Grants stay; the content is closed to everyone by permissions.ts.
 */
export const trashFile = Effect.fn('trashFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'trashFile' } })
  const at = toDate(base.now)
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}`),
    d.update(schema.files).set({ isDeleted: true, deletedAt: at, deletedByUserId: caller.userId })
      .where(and(eq(schema.files.id, file.id), eq(schema.files.workspaceId, input.workspaceId))),
    d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
      .where(and(eq(schema.shareLinks.fileId, file.id), sql`${schema.shareLinks.revokedAt} IS NULL`)),
    d.update(schema.resourceInvitations).set({ status: 'canceled' })
      .where(and(eq(schema.resourceInvitations.fileId, file.id), eq(schema.resourceInvitations.status, 'pending'))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'file.trashed', at: base.now }, activityId),
  ])
  return { fileId: file.id }
})

/** Brings a file back from the trash. Links do not come back. A name taken at the old place gets a "(2)" style suffix. */
export const restoreFile = Effect.fn('restoreFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'restoreFile' } })
  const db = yield* Db
  const here = and(
    eq(schema.files.workspaceId, input.workspaceId), eq(schema.files.isDeleted, false), eq(schema.files.status, 'uploaded'),
    sql`${schema.files.projectId} IS ${file.projectId}`, sql`${schema.files.id} <> ${file.id}`,
  )
  const clash = yield* db.use((d) => d.select({ id: schema.files.id }).from(schema.files).where(and(here, eq(schema.files.name, file.name))).limit(1))
  const name = clash.length === 0 ? file.name : restoredName(file.name, file.extension, new Set((yield* db.use((d) =>
    d.select({ name: schema.files.name }).from(schema.files).where(and(here, sql`${schema.files.name} LIKE ${`${stemOf(file.name, file.extension).replace(/[\\%_]/g, '\\$&')} (%`} ESCAPE '\\'`)),
  )).map((r) => r.name)))
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(true)}`),
    d.update(schema.files).set({ isDeleted: false, deletedAt: null, deletedByUserId: null, name })
      .where(and(eq(schema.files.id, file.id), eq(schema.files.workspaceId, input.workspaceId))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'file.restored', at: base.now }, activityId),
  ])
  return { fileId: file.id, name }
})

/** The R2 keys a file holds: the current object, its thumbnail, every version and their thumbnails (deduplicated). */
const keysOf = Effect.fnUntraced(function* (fileId: string) {
  const db = yield* Db
  const [files, versions] = yield* db.use((d) =>
    Promise.all([
      d.select({ r2Key: schema.files.r2Key, thumb: schema.files.thumbnailR2Key }).from(schema.files).where(eq(schema.files.id, fileId)),
      d.select({ r2Key: schema.fileVersions.r2Key, thumb: schema.fileVersions.thumbnailR2Key }).from(schema.fileVersions).where(eq(schema.fileVersions.fileId, fileId)),
    ]),
  )
  return [...new Set([...files, ...versions].flatMap((r) => r.thumb === null ? [r.r2Key] : [r.r2Key, r.thumb]))]
})

const DRAIN_CHUNK = 40

/**
 * Deletes one trashed file for good, in one batch (docs/09 §5.3): the guard (still trashed, the actor still allowed), the
 * R2 keys no other row references go to `storage_deletions` (read at write time, so a version added a moment ago is
 * included), then the RESTRICT tables (`file_access`, `share_links`, `resource_invitations`), then the file itself (versions,
 * stars, comments and the other legacy tables cascade), and the `file.purged` activity. Keys another file or version still
 * uses, and anything under `blog/`, are never queued. D1 first, R2 second: the objects are deleted right after, best
 * effort; the hourly worker retries.
 */
export const purgeOne = (caller: Caller | null, workspaceId: string, fileId: string, role: string | null, now: number) =>
  Effect.gen(function* () {
    const keys = yield* keysOf(fileId)
    const activityId = yield* newUlid
    yield* runBatch((d) => [
      guard(d, sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND workspaceId = ${workspaceId} AND isDeleted = 1)
        AND ${caller === null || role === null ? sql`1` : stillRole(workspaceId, caller.userId, [role])}`),
      d.insert(schema.storageDeletions).select(sql`SELECT k, ${caller === null ? 'trash_retention' : 'purged'}, ${now}, 0, NULL, ${now} FROM (
          SELECT r2Key AS k FROM files WHERE id = ${fileId}
          UNION SELECT thumbnailR2Key FROM files WHERE id = ${fileId}
          UNION SELECT r2Key FROM file_versions WHERE fileId = ${fileId}
          UNION SELECT thumbnailR2Key FROM file_versions WHERE fileId = ${fileId})
        WHERE k IS NOT NULL AND substr(k, 1, 5) <> 'blog/'
          AND NOT EXISTS (SELECT 1 FROM files o WHERE o.id <> ${fileId} AND (o.r2Key = k OR o.thumbnailR2Key = k))
          AND NOT EXISTS (SELECT 1 FROM file_versions ov WHERE ov.fileId <> ${fileId} AND (ov.r2Key = k OR ov.thumbnailR2Key = k))`).onConflictDoNothing(),
      d.delete(schema.fileAccess).where(eq(schema.fileAccess.fileId, fileId)),
      d.delete(schema.shareLinks).where(eq(schema.shareLinks.fileId, fileId)),
      d.delete(schema.resourceInvitations).where(eq(schema.resourceInvitations.fileId, fileId)),
      d.delete(schema.files).where(and(eq(schema.files.id, fileId), eq(schema.files.workspaceId, workspaceId), eq(schema.files.isDeleted, true))),
      activity(d, { workspaceId, caller, targetKind: 'file', targetId: fileId, action: 'file.purged', at: now }, activityId),
    ])
    return keys
  })

/** Best-effort immediate R2 deletion of the keys a purge queued. */
const drainKeys = Effect.fnUntraced(function* (keys: ReadonlyArray<string>) {
  for (let i = 0; i < keys.length; i += DRAIN_CHUNK) {
    yield* drainStorageDeletions({ keys: keys.slice(i, i + DRAIN_CHUNK) }).pipe(Effect.ignore)
  }
})

/** Permanently deletes a trashed file (owner and admin only, by permissions.ts). */
export const purgeFile = Effect.fn('purgeFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file, role } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'purgeFile' } })
  yield* drainKeys(yield* purgeOne(caller, input.workspaceId, file.id, role, base.now))
  return { fileId: file.id }
})

const EMPTY_TRASH_GROUP = 50

/**
 * Purges the workspace's trash in groups of 50 (docs/09 §5.3); `more` tells the client to call again. Every file goes
 * through the `purgeFile` decision; a file in an archived project is skipped (it expires with the daily job), any other
 * denial (a member, a commenter) fails the call.
 */
export const emptyTrash = Effect.fn('emptyTrash')(function* (caller: Caller, input: { readonly workspaceId: string }) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const db = yield* Db
  const f = schema.files
  const rows = yield* db.use((d) =>
    d.select({ id: f.id, projectId: f.projectId, isDeleted: f.isDeleted }).from(f)
      .where(and(eq(f.workspaceId, input.workspaceId), eq(f.isDeleted, true), eq(f.status, 'uploaded'),
        sql`(${f.projectId} IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ${f.projectId} AND p.archivedAt IS NULL))`))
      .orderBy(asc(f.id)).limit(EMPTY_TRASH_GROUP),
  )
  const grants = yield* fileGrantsOf(input.workspaceId, caller.userId, rows.map((r) => r.id))
  let purged = 0
  for (const row of rows) {
    const base = scopedInput(scope, row, grants.get(row.id))
    if (base === undefined) continue
    yield* authorize({ ...base, action: { kind: 'purgeFile' } })
    yield* drainKeys(yield* purgeOne(caller, input.workspaceId, row.id, scope.role, scope.now).pipe(Effect.catchTag('WriteConflict', () => Effect.succeed([] as ReadonlyArray<string>))))
    purged++
  }
  return { purged, more: rows.length === EMPTY_TRASH_GROUP }
})

const encodeCursor = (id: string, value: number) => `${id}|${value}`
const decodeCursor = (cursor: string) => {
  const bar = cursor.indexOf('|')
  const value = Number(cursor.slice(bar + 1))
  return bar < 1 || !Number.isSafeInteger(value) ? Effect.fail(new ValidationError({ message: 'invalid cursor' })) : Effect.succeed({ id: cursor.slice(0, bar), value })
}

/**
 * The trash the caller may restore from (docs/09 §5.3): newest deletion first, each row through the `restoreFile`
 * decision. A commenter or guest sees an empty list. Legacy rows without `deletedAt` fall back to `updatedAt`.
 */
export const listTrash = Effect.fn('listTrash')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly limit: number; readonly cursor: string | null },
) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const limits = yield* (yield* Entitlements).limits(input.workspaceId)
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const f = schema.files
  const deletedAt = sql<number>`COALESCE(${f.deletedAt}, ${f.updatedAt})`
  const conditions: Array<SQL | undefined> = [
    eq(f.workspaceId, input.workspaceId), eq(f.isDeleted, true), eq(f.status, 'uploaded'),
    after === null ? undefined : sql`(${deletedAt} < ${after.value} OR (${deletedAt} = ${after.value} AND ${f.id} < ${after.id}))`,
  ]
  const items: Array<{ readonly item: TrashItem; readonly cursor: string }> = []
  let cursorRow: { id: string; value: number } | null = null
  let exhausted = false
  for (let round = 0; round < 10 && items.length <= input.limit && !exhausted; round++) {
    const rows = yield* db.use((d) =>
      d.select({
        id: f.id, name: f.name, extension: f.extension, size: f.size, projectId: f.projectId, projectName: schema.projects.name,
        isDeleted: f.isDeleted, deletedAt, deleter: schema.user.name,
      }).from(f)
        .leftJoin(schema.projects, eq(schema.projects.id, f.projectId))
        .leftJoin(schema.user, eq(schema.user.id, f.deletedByUserId))
        .where(and(...conditions, cursorRow === null ? undefined : sql`(${deletedAt} < ${cursorRow.value} OR (${deletedAt} = ${cursorRow.value} AND ${f.id} < ${cursorRow.id}))`))
        .orderBy(desc(deletedAt), desc(f.id)).limit(40),
    )
    if (rows.length < 40) exhausted = true
    const grants = yield* fileGrantsOf(input.workspaceId, caller.userId, rows.map((r) => r.id))
    for (const row of rows) {
      cursorRow = { id: row.id, value: row.deletedAt }
      const base = scopedInput(scope, row, grants.get(row.id))
      if (base === undefined || !decidePermission({ ...base, action: { kind: 'restoreFile' } }).allowed) continue
      items.push({
        cursor: encodeCursor(row.id, row.deletedAt),
        item: {
          id: row.id, name: row.name, extension: row.extension, size: row.size, projectId: row.projectId, projectName: row.projectName,
          deletedAt: row.deletedAt, deletedBy: personOf(row.deleter), purgeAt: row.deletedAt + limits.trashRetentionDays * DAY,
          can: { restore: true, purge: decidePermission({ ...base, action: { kind: 'purgeFile' } }).allowed },
        },
      })
    }
  }
  const page = items.slice(0, input.limit)
  const last = items.length > input.limit ? page[page.length - 1] : undefined
  const nextCursor = last !== undefined ? last.cursor : !exhausted && cursorRow !== null ? encodeCursor(cursorRow.id, cursorRow.value) : null
  return { items: page.map((i) => i.item), nextCursor }
})

const PURGE_WORKSPACES_PER_RUN = 100
const PURGE_FILES_PER_RUN = 200

/**
 * Daily (docs/09 §5.3): purges files that have been in the trash longer than their workspace's
 * `Entitlements.trashRetentionDays` (D21: 30), as the system. A legacy row without `deletedAt` counts from `updatedAt`.
 * Files without a workspace (not backfilled yet) are left alone. At most 200 files per run; the rest follow the next day.
 */
export const purgeExpiredTrash = Effect.fn('purgeExpiredTrash')(function* () {
  const db = yield* Db
  const entitlements = yield* Entitlements
  const now = yield* nowSeconds
  const f = schema.files
  const workspaces = yield* db.use((d) =>
    d.selectDistinct({ id: f.workspaceId }).from(f).where(and(eq(f.isDeleted, true), eq(f.status, 'uploaded'), sql`${f.workspaceId} IS NOT NULL`)).limit(PURGE_WORKSPACES_PER_RUN),
  )
  let purged = 0
  for (const { id: workspaceId } of workspaces) {
    if (workspaceId === null || purged >= PURGE_FILES_PER_RUN) continue
    const limits = yield* entitlements.limits(workspaceId)
    const cutoff = now - limits.trashRetentionDays * DAY
    const due = yield* db.use((d) =>
      d.select({ id: f.id }).from(f).where(and(
        eq(f.workspaceId, workspaceId), eq(f.isDeleted, true), eq(f.status, 'uploaded'),
        sql`COALESCE(${f.deletedAt}, ${f.updatedAt}) < ${cutoff}`,
      )).orderBy(asc(f.id)).limit(PURGE_FILES_PER_RUN - purged),
    )
    for (const row of due) {
      const done = yield* purgeOne(null, workspaceId, row.id, null, now).pipe(Effect.as(true), Effect.catchTag('WriteConflict', () => Effect.succeed(false)))
      if (done) purged++
    }
  }
  return { purged }
})
