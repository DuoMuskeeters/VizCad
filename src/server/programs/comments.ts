import { and, asc, eq, gt, or, type SQL, sql } from 'drizzle-orm'
import { Effect, Option, Schema } from 'effect'
import * as schema from '../db/schema'
import { CommentUnavailable, PermissionDenied, ValidationError, VersionChanged } from '../errors'
import { decidePermission } from '../permissions'
import type { CommentPage, CommentView } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { decodeCursor, encodeCursor } from './activity'
import { currentVersionOf, openFile } from './fileContext'
import { StoredAnchor, type CommentAnchor } from '../scene'
import { activity, authorize, type Caller, guard, newUlid, runBatch, stillRole, toDate, toSeconds } from './shared'

/** Longest comment (docs/09 §6). The text is plain; the client renders it as text, never as HTML. */
export const MAX_COMMENT_LENGTH = 4000

/** Roles whose comments a guest may see (when written as `internal`): every internal role. Must match permissions.ts (`roleCap > 0`, not `guest`). */
const INTERNAL_ROLES = sql`('owner', 'admin', 'member', 'commenter')`

/**
 * SQL form of permissions.ts `viewComment` for a guest viewer: the viewer's own comments, and comments written as
 * `internal` whose author is an internal member of the workspace right now. A comment with a NULL scope (legacy) is
 * never visible. Equivalence with `decidePermission` is pinned by a test over every combination.
 */
export const guestVisible = (c: typeof schema.fileComments, workspaceId: string, me: string) =>
  sql`(${c.userId} = ${me} OR (${c.authorScopeAtWrite} = 'internal' AND EXISTS (
    SELECT 1 FROM member m WHERE m.organizationId = ${workspaceId} AND m.userId = ${c.userId} AND m.role IN ${INTERNAL_ROLES})))`

interface CommentRow {
  readonly id: string
  readonly parentId: string | null
  readonly userId: string
  readonly authorName: string | null
  readonly content: string
  readonly createdAt: Date
  readonly versionNumber: number | null
  readonly deletedAt: Date | null
  readonly anchor: string | null
}

const readAnchor = (text: string | null) =>
  text === null ? null : Option.match(Schema.decodeUnknownOption(StoredAnchor)(text), { onNone: () => null, onSome: (a) => ({ path: a.path, point: a.point }) })

const project = (row: CommentRow, me: string, manager: boolean): CommentView => ({
  id: row.id,
  parentId: row.parentId,
  author: row.authorName === null ? null : { displayName: row.authorName },
  content: row.deletedAt === null ? row.content : '',
  deleted: row.deletedAt !== null,
  createdAt: toSeconds(row.createdAt),
  versionNumber: row.versionNumber,
  // A deleted comment keeps no pin.
  anchor: row.deletedAt === null ? readAnchor(row.anchor) : null,
  mine: row.userId === me,
  canDelete: row.deletedAt === null && (row.userId === me || manager),
})

const commentColumns = () => {
  const c = schema.fileComments
  return {
    id: c.id, parentId: c.parentId, userId: c.userId, authorName: schema.user.name, content: c.content, createdAt: c.createdAt,
    versionNumber: c.versionNumber, deletedAt: c.deletedAt, anchor: c.anchor,
  }
}

/**
 * The comments of a file, oldest first, one page (docs/09 §6). Needs `view`. An internal viewer sees all of them; a guest
 * sees only the comments `viewComment` allows, filtered in SQL before the page is cut so counts and cursors never leak a
 * hidden comment. A link never reaches this program (links cannot comment).
 */
export const listComments = Effect.fn('listComments')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly limit: number; readonly cursor: string | null },
) {
  const { base, file, role } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const c = schema.fileComments
  const conditions: Array<SQL | undefined> = [
    eq(c.fileId, file.id),
    role === 'guest' ? guestVisible(c, input.workspaceId, caller.userId) : undefined,
    after === null ? undefined : or(gt(c.createdAt, toDate(after.createdAt)), and(eq(c.createdAt, toDate(after.createdAt)), gt(c.id, after.id))),
  ]
  const rows = yield* db.use((d) =>
    d.select(commentColumns()).from(c)
      .leftJoin(schema.user, eq(schema.user.id, c.userId))
      .where(and(...conditions))
      .orderBy(asc(c.createdAt), asc(c.id))
      .limit(input.limit + 1),
  )
  const manager = role === 'owner' || role === 'admin'
  const page = rows.slice(0, input.limit).map((r) => project(r, caller.userId, manager))
  const last = rows[input.limit - 1]
  return { items: page, nextCursor: rows.length > input.limit && last !== undefined ? encodeCursor(toSeconds(last.createdAt), last.id) : null } satisfies CommentPage
})

/**
 * Writes a comment (docs/09 §6): needs `comment` on the file (internal role or a live guest grant; a link is denied by
 * permissions.ts with LINK_NO_COMMENTS before it gets here). `authorScopeAtWrite` is `guest` for a guest and `internal`
 * for every other role, and the batch guard re-reads the role, so a role change in between writes nothing. A reply must
 * point at a visible, undeleted top-level comment of the same file. The log row has the event only, never the text.
 * A pin carries the version it was placed on: the comment lands on the current version, so a pin placed on another one
 * (a new version uploaded or restored meanwhile) is refused with VersionChanged, checked first and again in the batch.
 */
export const addComment = Effect.fn('addComment')(function* (
  caller: Caller,
  input: {
    readonly workspaceId: string
    readonly fileId: string
    readonly content: string
    readonly parentId?: string
    readonly anchor?: CommentAnchor & { readonly version: number }
  },
) {
  const content = input.content.trim()
  if (content === '' || content.length > MAX_COMMENT_LENGTH) return yield* new ValidationError({ message: 'invalid comment' })
  // A pin starts a thread: a reply belongs to its comment's pin.
  if (input.anchor !== undefined && input.parentId !== undefined) return yield* new ValidationError({ message: 'a reply has no pin' })
  const anchor = input.anchor === undefined ? null : JSON.stringify({ v: 1, path: input.anchor.path, point: input.anchor.point })
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'comment' } })
  const pinVersion = input.anchor?.version ?? null
  if (pinVersion !== null && (yield* currentVersionOf(file)) !== pinVersion) return yield* new VersionChanged()
  const db = yield* Db
  const c = schema.fileComments
  const parentId = input.parentId ?? null
  if (parentId !== null) {
    const parent = (yield* db.use((d) =>
      d.select({ userId: c.userId, parentId: c.parentId, deletedAt: c.deletedAt, scope: c.authorScopeAtWrite, authorRole: schema.member.role })
        .from(c)
        .leftJoin(schema.member, and(eq(schema.member.organizationId, input.workspaceId), eq(schema.member.userId, c.userId)))
        .where(and(eq(c.id, parentId), eq(c.fileId, file.id))).limit(1),
    ))[0]
    if (parent === undefined || parent.parentId !== null || parent.deletedAt !== null) return yield* new CommentUnavailable()
    const visible = decidePermission({
      ...base,
      action: { kind: 'viewComment', authorUserId: parent.userId, authorScopeAtWrite: parent.scope, authorRole: parent.authorRole },
    })
    if (!visible.allowed) return yield* new CommentUnavailable()
  }
  const id = yield* newUlid
  const activityId = yield* newUlid
  const scope = role === 'guest' ? 'guest' : 'internal'
  const current = sql`(SELECT COALESCE(f.currentVersionNumber, (SELECT count(*) FROM file_versions v WHERE v.fileId = f.id) + 1) FROM files f WHERE f.id = ${file.id})`
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}
      AND (${parentId} IS NULL OR EXISTS (SELECT 1 FROM file_comments p WHERE p.id = ${parentId} AND p.fileId = ${file.id} AND p.parentId IS NULL AND p.deletedAt IS NULL))
      AND (${pinVersion} IS NULL OR ${current} = ${pinVersion})`),
    // Columns in table order: id, fileId, userId, parentId, content, createdAt, updatedAt, authorScopeAtWrite, versionNumber, deletedAt, anchor.
    d.insert(c).select(sql`SELECT ${id}, f.id, ${caller.userId}, ${parentId}, ${content}, ${base.now}, ${base.now}, ${scope},
      COALESCE(f.currentVersionNumber, (SELECT count(*) FROM file_versions v WHERE v.fileId = f.id) + 1), NULL, ${anchor}
      FROM files f WHERE f.id = ${file.id}`),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'comment.created', at: base.now }, activityId),
  ]).pipe(
    // Nothing was written. A pin whose version is no longer the current one says so; anything else stays a conflict.
    Effect.catchTag('WriteConflict', (conflict) =>
      pinVersion === null
        ? Effect.fail(conflict)
        : openFile(caller, input.workspaceId, input.fileId).pipe(
            Effect.flatMap((again) => currentVersionOf(again.file)),
            Effect.flatMap((now) => Effect.fail(now === pinVersion ? conflict : new VersionChanged())),
          ),
    ),
  )
  const row = (yield* db.use((d) =>
    d.select(commentColumns()).from(c).leftJoin(schema.user, eq(schema.user.id, c.userId)).where(eq(c.id, id)).limit(1),
  ))[0]
  if (row === undefined) return yield* new CommentUnavailable()
  return project(row, caller.userId, role === 'owner' || role === 'admin')
})

/**
 * Deletes a comment softly (docs/09 §6): `deletedAt` set and the text emptied, replies stay. The author or an owner or
 * admin may do it, and the caller must still be able to see the file and the comment. Deleting again is a no-op success.
 * Editing does not exist in this phase (docs/09 §6).
 */
export const deleteComment = Effect.fn('deleteComment')(function* (caller: Caller, input: { readonly workspaceId: string; readonly commentId: string }) {
  const db = yield* Db
  const c = schema.fileComments
  const found = (yield* db.use((d) =>
    d.select({ fileId: c.fileId, userId: c.userId, deletedAt: c.deletedAt, scope: c.authorScopeAtWrite, authorRole: schema.member.role })
      .from(c)
      .innerJoin(schema.files, and(eq(schema.files.id, c.fileId), eq(schema.files.workspaceId, input.workspaceId)))
      .leftJoin(schema.member, and(eq(schema.member.organizationId, input.workspaceId), eq(schema.member.userId, c.userId)))
      .where(eq(c.id, input.commentId)).limit(1),
  ))[0]
  if (found === undefined) return yield* new CommentUnavailable()
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, found.fileId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  const visible = decidePermission({
    ...base,
    action: { kind: 'viewComment', authorUserId: found.userId, authorScopeAtWrite: found.scope, authorRole: found.authorRole },
  })
  if (!visible.allowed) return yield* new CommentUnavailable()
  const manager = role === 'owner' || role === 'admin'
  if (found.userId !== caller.userId && !manager) return yield* new PermissionDenied({ reason: 'ROLE_LIMIT' })
  if (found.deletedAt !== null) return { commentId: input.commentId, deleted: true }
  const activityId = yield* newUlid
  const at = toDate(base.now)
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}
      AND EXISTS (SELECT 1 FROM file_comments WHERE id = ${input.commentId} AND fileId = ${file.id} AND deletedAt IS NULL)`),
    d.update(c).set({ content: '', deletedAt: at, updatedAt: at }).where(and(eq(c.id, input.commentId), eq(c.fileId, file.id))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'comment.deleted', at: base.now }, activityId),
  ])
  return { commentId: input.commentId, deleted: true }
})
