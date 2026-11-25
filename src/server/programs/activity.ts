import { and, desc, eq, lt, or } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { ValidationError } from '../errors'
import { Db } from '../services/Db'
import type { FileActivityPage } from '../../shared/fileViews'
import { openFile } from './fileContext'
import { authorize, type Caller, maxUnixSeconds, nowSeconds, permissionActor, requireMembership, toDate, toSeconds } from './shared'

/** Keyset cursor `<createdAt>.<id>`: stable under concurrent inserts, never an offset. */
export const encodeCursor = (createdAt: number, id: string) => `${createdAt}.${id}`

export const decodeCursor =(cursor: string) => {
  const dot = cursor.indexOf('.')
  const createdAt = Number(cursor.slice(0, dot))
  const id = cursor.slice(dot + 1)
  return dot > 0 && Number.isSafeInteger(createdAt) && createdAt >= 0 && createdAt <= maxUnixSeconds && id !== '' ? Effect.succeed({ createdAt, id }) : Effect.fail(new ValidationError({ message: 'invalid cursor' }))
}

/**
 * The workspace's activity, newest first, for owners and admins (docs/08 §6). Rows carry ids and fixed action names
 * only (never tokens, emails or request payloads); the actor's display name is joined for the UI.
 */
export const listActivity = Effect.fn('listActivity')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly limit: number; readonly cursor: string | null },
) {
  const { workspace, role } = yield* requireMembership(input.workspaceId, caller.userId)
  const now = yield* nowSeconds
  yield* authorize({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'listActivity' } })
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const log = schema.accessLog
  const rows = yield* db.use((d) =>
    d.select({
      id: log.id, actorKind: log.actorKind, actorUserId: log.actorUserId, actorName: schema.user.name, linkId: log.linkId,
      targetKind: log.targetKind, targetId: log.targetId, action: log.action, outcome: log.outcome, createdAt: log.createdAt,
    })
      .from(log)
      .leftJoin(schema.user, eq(schema.user.id, log.actorUserId))
      .where(and(
        eq(log.workspaceId, workspace.id),
        after === null ? undefined : or(lt(log.createdAt, toDate(after.createdAt)), and(eq(log.createdAt, toDate(after.createdAt)), lt(log.id, after.id))),
      ))
      .orderBy(desc(log.createdAt), desc(log.id))
      .limit(input.limit + 1),
  )
  const page = rows.slice(0, input.limit).map((r) => ({ ...r, createdAt: toSeconds(r.createdAt) }))
  const last = page[page.length - 1]
  return { items: page, nextCursor: rows.length > input.limit && last !== undefined ? encodeCursor(last.createdAt, last.id) : null }
})

/**
 * One file's activity, newest first (docs/09 §7.4): the "Aktivite" tab. Needs `edit` on the file, so a guest, a commenter
 * and a link never get it. Rows are the log's fixed event names; the actor's name is read from `user` now (the log stores
 * ids only), a link actor has no name, and nothing here exposes link ids, request ids or IPs.
 */
export const listFileActivity = Effect.fn('listFileActivity')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly limit: number; readonly cursor: string | null },
) {
  const { base, file } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'edit' } })
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor)
  const db = yield* Db
  const log = schema.accessLog
  const rows = yield* db.use((d) =>
    d.select({ id: log.id, actorKind: log.actorKind, actorName: schema.user.name, action: log.action, outcome: log.outcome, createdAt: log.createdAt })
      .from(log)
      .leftJoin(schema.user, eq(schema.user.id, log.actorUserId))
      .where(and(
        eq(log.workspaceId, input.workspaceId), eq(log.targetKind, 'file'), eq(log.targetId, file.id),
        after === null ? undefined : or(lt(log.createdAt, toDate(after.createdAt)), and(eq(log.createdAt, toDate(after.createdAt)), lt(log.id, after.id))),
      ))
      .orderBy(desc(log.createdAt), desc(log.id))
      .limit(input.limit + 1),
  )
  const page = rows.slice(0, input.limit)
  const last = page[page.length - 1]
  return {
    items: page.map((r) => ({
      id: r.id, action: r.action, outcome: r.outcome, createdAt: toSeconds(r.createdAt),
      actor: { kind: r.actorKind, displayName: r.actorKind === 'user' ? r.actorName : null },
    })),
    nextCursor: rows.length > input.limit && last !== undefined ? encodeCursor(toSeconds(last.createdAt), last.id) : null,
  } satisfies FileActivityPage
})
