import { and, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { WriteConflict } from '../errors'
import { Db } from '../services/Db'
import { openFile } from './fileContext'
import {
  activity, authorize, type Caller, guard, loadProject, newUlid, opt, projectGrantOf, projectStill, runBatch, stillRole, toDate,
} from './shared'

/** What a move into a restricted project takes away (docs/08 §4 step 5, docs/09 §5.4). All zero for any other target. */
export interface MoveEffects {
  readonly links: number
  readonly invitations: number
  readonly guestGrants: number
  readonly memberGrants: number
}

const none: MoveEffects = { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 }

const countEffects = (fileId: string) =>
  sql`SELECT
    (SELECT count(*) FROM share_links WHERE fileId = ${fileId} AND revokedAt IS NULL) AS links,
    (SELECT count(*) FROM resource_invitations WHERE fileId = ${fileId} AND status = 'pending') AS invitations,
    (SELECT count(*) FROM file_access fa JOIN member m ON m.organizationId = fa.workspaceId AND m.userId = fa.userId
      WHERE fa.fileId = ${fileId} AND fa.source = 'grant' AND m.role = 'guest') AS guestGrants,
    (SELECT count(*) FROM file_access fa JOIN member m ON m.organizationId = fa.workspaceId AND m.userId = fa.userId
      WHERE fa.fileId = ${fileId} AND fa.source = 'grant' AND m.role <> 'guest') AS memberGrants`

/**
 * Decides the move (permissions.ts `moveFile`: write on the source, the destination's own upload rule, restricted
 * projects need a manager) and returns the context both entry points share. `targetProjectId` null means "no project".
 */
const planMove = Effect.fnUntraced(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string; readonly targetProjectId: string | null }) {
  const opened = yield* openFile(caller, input.workspaceId, input.fileId)
  const destination = input.targetProjectId === null ? null : yield* loadProject(input.workspaceId, input.targetProjectId)
  const destinationGrant = destination === null ? undefined : yield* projectGrantOf(input.workspaceId, destination.id, caller.userId)
  yield* authorize({
    ...opened.base,
    action: {
      kind: 'moveFile',
      target: {
        workspaceId: input.workspaceId,
        project: destination === null ? null : {
          id: destination.id, workspaceId: destination.workspaceId, accessMode: destination.accessMode, archived: destination.archivedAt !== null,
          createdByUserId: destination.createdByUserId, creatorManagerUserId: destination.creatorManagerUserId,
        },
        ...opt('projectGrant', destinationGrant),
      },
    },
  })
  const db = yield* Db
  const counted = yield* db.use((d) => d.get<MoveEffects>(countEffects(opened.file.id)))
  const entering = destination?.accessMode === 'restricted' && destination.id !== opened.file.projectId
  return { ...opened, destination, entering, effects: entering ? (counted ?? none) : none, same: destination?.id === opened.file.projectId || (destination === null && opened.file.projectId === null) }
})

/** What `moveFile` would revoke, so the UI can ask first (docs/09 §5.4). Changes nothing. */
export const previewMoveFile = Effect.fn('previewMoveFile')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly targetProjectId: string | null },
) {
  const plan = yield* planMove(caller, input)
  return { fileId: plan.file.id, targetProjectId: input.targetProjectId, effects: plan.effects }
})

/**
 * Moves a file to another project (or out of all projects) of the same workspace. Into a restricted project the active
 * links are revoked, pending external invitations canceled and the guest and ordinary file grants removed in the same
 * batch; the uploader's own grant and the project's own access stay. `expected` is the preview the user confirmed: when
 * the effects differ now (or differ at write time) the call fails with `WriteConflict` and nothing moves.
 */
export const moveFile = Effect.fn('moveFile')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly targetProjectId: string | null; readonly expected?: MoveEffects },
) {
  const plan = yield* planMove(caller, input)
  const { file, destination, effects, role, still } = plan
  if (plan.same) return { fileId: file.id, projectId: file.projectId, moved: false, effects: none }
  const expected = input.expected
  if (expected !== undefined && (expected.links !== effects.links || expected.invitations !== effects.invitations
    || expected.guestGrants !== effects.guestGrants || expected.memberGrants !== effects.memberGrants)) {
    return yield* new WriteConflict()
  }
  const at = toDate(plan.base.now)
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql.join([
      stillRole(input.workspaceId, caller.userId, [role]),
      still(false),
      ...(destination === null ? [] : [projectStill(destination.id, destination.accessMode)]),
      ...(plan.entering
        ? [sql`(SELECT links FROM (${countEffects(file.id)})) = ${effects.links}`,
          sql`(SELECT invitations FROM (${countEffects(file.id)})) = ${effects.invitations}`,
          sql`(SELECT guestGrants FROM (${countEffects(file.id)})) = ${effects.guestGrants}`,
          sql`(SELECT memberGrants FROM (${countEffects(file.id)})) = ${effects.memberGrants}`]
        : []),
    ], sql` AND `)),
    ...(plan.entering
      ? [
        d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
          .where(and(eq(schema.shareLinks.fileId, file.id), sql`${schema.shareLinks.revokedAt} IS NULL`)),
        d.update(schema.resourceInvitations).set({ status: 'canceled' })
          .where(and(eq(schema.resourceInvitations.fileId, file.id), eq(schema.resourceInvitations.status, 'pending'))),
        d.delete(schema.fileAccess).where(and(eq(schema.fileAccess.fileId, file.id), eq(schema.fileAccess.source, 'grant'))),
      ]
      : []),
    d.update(schema.files).set({ projectId: destination?.id ?? null, updatedAt: at })
      .where(and(eq(schema.files.id, file.id), eq(schema.files.workspaceId, input.workspaceId))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'file.moved', at: plan.base.now }, activityId),
  ])
  return { fileId: file.id, projectId: destination?.id ?? null, moved: true, effects }
})
