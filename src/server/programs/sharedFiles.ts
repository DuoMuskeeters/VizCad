import { and, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { decidePermission } from '../permissions'
import type { SharedByMeItem, SharedPage, SharedWithMeItem } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { decodeCursor, encodeCursor } from './activity'
import { fileGrantsOf, loadScope, scopedInput } from './fileContext'
import { type Caller, toSeconds } from './shared'

const isLevel = (value: string | undefined): value is SharedWithMeItem['level'] =>
  value === 'view' || value === 'comment' || value === 'download' || value === 'edit'

/**
 * Files other people shared with the caller in this workspace (docs/09 §5.1): the caller's live `grant` rows (not the
 * uploader row), newest grant first, on files that are uploaded and not trashed. Each row still goes through
 * permissions.ts `view`. The shape is the same for guests and members and carries no project or version detail. One
 * query for the page, one for the caller's grants. `limit` is at most 50 (bound-parameter budget of the grant look-up).
 */
export const listSharedWithMe = Effect.fn('listSharedWithMe')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly limit: number; readonly cursor: string | null },
) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const f = schema.files
  const a = schema.fileAccess
  const rows = yield* db.use((d) =>
    d.select({
      id: f.id, name: f.name, extension: f.extension, size: f.size, projectId: f.projectId, isDeleted: f.isDeleted, updatedAt: f.updatedAt,
      hasThumbnail: sql<number>`${f.thumbnailR2Key} IS NOT NULL`, sharedAt: a.createdAt, sharedBy: schema.user.name,
    }).from(a)
      .innerJoin(f, and(eq(f.id, a.fileId), eq(f.workspaceId, a.workspaceId)))
      .leftJoin(schema.user, eq(schema.user.id, a.grantedByUserId))
      .where(and(
        eq(a.workspaceId, input.workspaceId), eq(a.userId, caller.userId), eq(a.source, 'grant'),
        eq(f.isDeleted, false), eq(f.status, 'uploaded'),
        sql`(${a.expiresAt} IS NULL OR ${a.expiresAt} > ${scope.now})`,
        after === null ? undefined : sql`(${a.createdAt} < ${after.createdAt} OR (${a.createdAt} = ${after.createdAt} AND ${f.id} < ${after.id}))`,
      ))
      .orderBy(desc(a.createdAt), desc(f.id))
      .limit(input.limit + 1),
  )
  const grants = yield* fileGrantsOf(input.workspaceId, caller.userId, rows.map((r) => r.id))
  const items: Array<{ readonly item: SharedWithMeItem; readonly cursor: string }> = []
  for (const row of rows) {
    const grant = grants.get(row.id)
    const base = scopedInput(scope, row, grant)
    const level = grant?.grant.level
    if (base === undefined || grant === undefined || !isLevel(level) || !decidePermission({ ...base, action: { kind: 'view' } }).allowed) continue
    items.push({
      cursor: encodeCursor(toSeconds(row.sharedAt), row.id),
      item: {
        id: row.id, name: row.name, extension: row.extension, size: row.size, updatedAt: toSeconds(row.updatedAt),
        thumbnailAvailable: row.hasThumbnail === 1, level, expiresAt: grant.grant.expiresAt,
        sharedAt: toSeconds(row.sharedAt), sharedBy: row.sharedBy === null ? null : { displayName: row.sharedBy },
      },
    })
  }
  const page = items.slice(0, input.limit)
  const last = page[page.length - 1]
  return { items: page.map((i) => i.item), nextCursor: rows.length > input.limit && last !== undefined ? last.cursor : null } satisfies SharedPage<SharedWithMeItem>
})

/**
 * Files the caller shared (docs/09 §5.1): files that carry a live grant the caller gave, or an active link the caller
 * created. One row per file with the counts, newest share first. The recipients' names are not listed here (the share
 * dialog has them); only the caller's own records, so a guest or a member with nothing shared gets an empty page. Each
 * file still goes through `view`.
 */
export const listSharedByMe = Effect.fn('listSharedByMe')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly limit: number; readonly cursor: string | null },
) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const f = schema.files
  const me = caller.userId
  const now = scope.now
  const liveGrant = sql`g.fileId = ${f.id} AND g.grantedByUserId = ${me} AND g.source = 'grant' AND g.userId <> ${me} AND (g.expiresAt IS NULL OR g.expiresAt > ${now})`
  const liveLink = sql`l.fileId = ${f.id} AND l.createdByUserId = ${me} AND l.revokedAt IS NULL AND (l.expiresAt IS NULL OR l.expiresAt > ${now})
    AND (l.legacyMaxExpiresAt IS NULL OR l.legacyMaxExpiresAt > ${now})`
  const sharedAt = sql<number>`MAX(COALESCE((SELECT max(g.createdAt) FROM file_access g WHERE ${liveGrant}), 0), COALESCE((SELECT max(l.createdAt) FROM share_links l WHERE ${liveLink}), 0))`
  const conditions: Array<SQL | undefined> = [
    eq(f.workspaceId, input.workspaceId), eq(f.isDeleted, false), eq(f.status, 'uploaded'),
    sql`(EXISTS (SELECT 1 FROM file_access g WHERE ${liveGrant}) OR EXISTS (SELECT 1 FROM share_links l WHERE ${liveLink}))`,
    after === null ? undefined : sql`(${sharedAt} < ${after.createdAt} OR (${sharedAt} = ${after.createdAt} AND ${f.id} < ${after.id}))`,
  ]
  const rows = yield* db.use((d) =>
    d.select({
      id: f.id, name: f.name, extension: f.extension, size: f.size, projectId: f.projectId, isDeleted: f.isDeleted, updatedAt: f.updatedAt,
      hasThumbnail: sql<number>`${f.thumbnailR2Key} IS NOT NULL`, sharedAt,
      grants: sql<number>`(SELECT count(*) FROM file_access g WHERE ${liveGrant})`,
      linkActive: sql<number>`EXISTS (SELECT 1 FROM share_links l WHERE ${liveLink})`,
    }).from(f)
      .where(and(...conditions))
      .orderBy(desc(sharedAt), desc(f.id))
      .limit(input.limit + 1),
  )
  const grants = yield* fileGrantsOf(input.workspaceId, me, rows.map((r) => r.id))
  const items: Array<{ readonly item: SharedByMeItem; readonly cursor: string }> = []
  for (const row of rows) {
    const base = scopedInput(scope, row, grants.get(row.id))
    if (base === undefined || !decidePermission({ ...base, action: { kind: 'view' } }).allowed) continue
    items.push({
      cursor: encodeCursor(row.sharedAt, row.id),
      item: {
        id: row.id, name: row.name, extension: row.extension, size: row.size, updatedAt: toSeconds(row.updatedAt),
        thumbnailAvailable: row.hasThumbnail === 1, grants: row.grants, linkActive: row.linkActive === 1, sharedAt: row.sharedAt,
      },
    })
  }
  const page = items.slice(0, input.limit)
  const last = page[page.length - 1]
  return { items: page.map((i) => i.item), nextCursor: rows.length > input.limit && last !== undefined ? last.cursor : null } satisfies SharedPage<SharedByMeItem>
})
