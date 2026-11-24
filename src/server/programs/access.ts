import { and, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { AccessExpiryInvalid, InvalidAccessLevel, MemberUnavailable } from '../errors'
import type { AccessLevel, PermissionInput } from '../permissions'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import {
  activity,
  authorize,
  type Caller,
  fileForPermission,
  fileGrantOf,
  guard,
  loadFile,
  loadProject,
  newId,
  nowSeconds,
  opt,
  permissionActor,
  projectForPermission,
  projectGrantOf,
  projectStill,
  requireMembership,
  runBatch,
  stillRole,
  toDate,
} from './shared'

/** The recipient's role in the workspace, or MemberUnavailable. */
export const memberRole = Effect.fnUntraced(function* (workspaceId: string, userId: string) {
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select({ role: schema.member.role }).from(schema.member)
      .where(and(eq(schema.member.organizationId, workspaceId), eq(schema.member.userId, userId))).limit(1),
  )
  const row = found[0]
  if (row === undefined) return yield* new MemberUnavailable()
  return row.role
})

/**
 * The expiry rules for a new grant: in the future, and for guests mandatory and within the plan ceiling
 * (`Entitlements.guestAccessMaxSeconds`). The role ceiling itself comes from permissions.ts.
 */
export const checkExpiry = Effect.fnUntraced(function* (workspaceId: string, role: string, expiresAt: number | null, now: number) {
  if (expiresAt !== null && expiresAt <= now) return yield* new AccessExpiryInvalid()
  if (role !== 'guest') return
  if (expiresAt === null) return yield* new AccessExpiryInvalid()
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  if (expiresAt - now > limits.guestAccessMaxSeconds) return yield* new AccessExpiryInvalid()
})

/**
 * Runs the grant decision. The actor's own sharing right is decided first (a denial there is about the actor), then
 * the expiry rules; a ROLE_LIMIT after that can only come from the recipient side (level above the role's ceiling).
 */
export const authorizeGrant = <E, R>(sharing: PermissionInput, expiry: Effect.Effect<void, E, R>, grant: PermissionInput) =>
  authorize(sharing).pipe(
    Effect.andThen(expiry),
    Effect.andThen(
      authorize(grant).pipe(
        Effect.catchTag('PermissionDenied', (e) => Effect.fail(e.reason === 'ROLE_LIMIT' ? new InvalidAccessLevel() : e)),
      ),
    ),
  )

/** Context for a file decision: the file, its project and the caller's own grants on both. */
export const fileContext = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, fileId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const file = yield* loadFile(workspaceId, fileId)
  const project = file.projectId === null ? undefined : yield* loadProject(workspaceId, file.projectId)
  const base = {
    actor: permissionActor(caller, workspaceId, role),
    workspace,
    file: fileForPermission(file, workspaceId),
    ...opt('projectGrant', project === undefined ? undefined : yield* projectGrantOf(workspaceId, project.id, caller.userId)),
    ...opt('fileGrant', yield* fileGrantOf(workspaceId, fileId, caller.userId)),
    now: yield* nowSeconds,
    ...opt('project', project === undefined ? undefined : projectForPermission(project)),
  }
  const fileStill = sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND workspaceId = ${workspaceId} AND isDeleted = 0
    AND projectId IS ${file.projectId})`
  const still = project === undefined ? fileStill : sql`${fileStill} AND ${projectStill(project.id, project.accessMode)}`
  return { role, base, still }
})

export const projectContext = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, projectId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const project = yield* loadProject(workspaceId, projectId)
  const base = {
    actor: permissionActor(caller, workspaceId, role),
    workspace,
    project: projectForPermission(project),
    ...opt('projectGrant', yield* projectGrantOf(workspaceId, projectId, caller.userId)),
    now: yield* nowSeconds,
  }
  return { role, base, project, still: projectStill(projectId, project.accessMode) }
})

export interface GrantInput {
  readonly workspaceId: string
  readonly userId: string
  readonly level: AccessLevel
  /** UTC Unix seconds; mandatory for guests. */
  readonly expiresAt: number | null
}

/** Grants (or updates) a member's or guest's access to one file. Never touches the uploader grant. */
export const grantFileAccess = Effect.fn('grantFileAccess')(function* (caller: Caller, input: GrantInput & { readonly fileId: string }) {
  const { role, base, still } = yield* fileContext(caller, input.workspaceId, input.fileId)
  const recipientRole = yield* memberRole(input.workspaceId, input.userId)
  const recipient = { workspaceId: input.workspaceId, userId: input.userId, role: recipientRole }
  yield* authorizeGrant(
    { ...base, action: { kind: 'shareFile' } },
    checkExpiry(input.workspaceId, recipientRole, input.expiresAt, base.now),
    { ...base, action: { kind: 'grantFileAccess', recipient, level: input.level, expiresAt: input.expiresAt } },
  )
  const at = toDate(base.now)
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${stillRole(input.workspaceId, input.userId, [recipientRole])} AND ${still}`),
    d.insert(schema.fileAccess)
      .values({
        workspaceId: input.workspaceId, fileId: input.fileId, userId: input.userId, level: input.level,
        expiresAt: input.expiresAt === null ? null : toDate(input.expiresAt), grantedByUserId: caller.userId, source: 'grant', createdAt: at, updatedAt: at,
      })
      .onConflictDoUpdate({
        target: [schema.fileAccess.fileId, schema.fileAccess.userId],
        set: { level: input.level, expiresAt: input.expiresAt === null ? null : toDate(input.expiresAt), grantedByUserId: caller.userId, updatedAt: at },
        setWhere: eq(schema.fileAccess.source, 'grant'),
      }),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: input.fileId, action: 'file.access_granted', at: base.now }, activityId),
  ])
  return { fileId: input.fileId, userId: input.userId, level: input.level, expiresAt: input.expiresAt }
})

/** Removes a granted (not uploader) file access. Repeating it is a no-op that still checks the caller's right. */
export const revokeFileAccess = Effect.fn('revokeFileAccess')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly userId: string },
) {
  const { role, base } = yield* fileContext(caller, input.workspaceId, input.fileId)
  const db = yield* Db
  const grants = yield* db.use((d) =>
    d.select({ grantedByUserId: schema.fileAccess.grantedByUserId, role: schema.member.role }).from(schema.fileAccess)
      .innerJoin(schema.member, and(eq(schema.member.organizationId, schema.fileAccess.workspaceId), eq(schema.member.userId, schema.fileAccess.userId)))
      .where(and(eq(schema.fileAccess.workspaceId, input.workspaceId), eq(schema.fileAccess.fileId, input.fileId), eq(schema.fileAccess.userId, input.userId), eq(schema.fileAccess.source, 'grant')))
      .limit(1),
  )
  const grant = grants[0]
  if (grant === undefined) {
    yield* authorize({ ...base, action: { kind: 'shareFile' } })
    return { revoked: false }
  }
  yield* authorize({ ...base, action: { kind: 'revokeFileAccess', target: { workspaceId: input.workspaceId, resourceId: input.fileId, role: grant.role, grantedByUserId: grant.grantedByUserId } } })
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, stillRole(input.workspaceId, caller.userId, [role])),
    d.delete(schema.fileAccess).where(and(eq(schema.fileAccess.fileId, input.fileId), eq(schema.fileAccess.userId, input.userId), eq(schema.fileAccess.source, 'grant'))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: input.fileId, action: 'file.access_revoked', at: base.now }, activityId),
  ])
  return { revoked: true }
})

/** Grants (or updates) access to a project; it reaches the project's files. */
export const grantProjectAccess = Effect.fn('grantProjectAccess')(function* (caller: Caller, input: GrantInput & { readonly projectId: string }) {
  const { role, base, still } = yield* projectContext(caller, input.workspaceId, input.projectId)
  const recipientRole = yield* memberRole(input.workspaceId, input.userId)
  const recipient = { workspaceId: input.workspaceId, userId: input.userId, role: recipientRole }
  yield* authorizeGrant(
    { ...base, action: { kind: 'manageProjectAccess' } },
    checkExpiry(input.workspaceId, recipientRole, input.expiresAt, base.now),
    { ...base, action: { kind: 'grantProjectAccess', recipient, level: input.level, expiresAt: input.expiresAt } },
  )
  const at = toDate(base.now)
  const expiresAt = input.expiresAt === null ? null : toDate(input.expiresAt)
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${stillRole(input.workspaceId, input.userId, [recipientRole])} AND ${still}`),
    d.insert(schema.projectAccess)
      .values({ workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, level: input.level, expiresAt, grantedByUserId: caller.userId, createdAt: at, updatedAt: at })
      .onConflictDoUpdate({
        target: [schema.projectAccess.projectId, schema.projectAccess.userId],
        set: { level: input.level, expiresAt, grantedByUserId: caller.userId, updatedAt: at },
      }),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'project', targetId: input.projectId, action: 'project.access_granted', at: base.now }, activityId),
  ])
  return { projectId: input.projectId, userId: input.userId, level: input.level, expiresAt: input.expiresAt }
})

export const revokeProjectAccess = Effect.fn('revokeProjectAccess')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly projectId: string; readonly userId: string },
) {
  const { role, base } = yield* projectContext(caller, input.workspaceId, input.projectId)
  const db = yield* Db
  const grants = yield* db.use((d) =>
    d.select({ grantedByUserId: schema.projectAccess.grantedByUserId }).from(schema.projectAccess)
      .where(and(eq(schema.projectAccess.workspaceId, input.workspaceId), eq(schema.projectAccess.projectId, input.projectId), eq(schema.projectAccess.userId, input.userId)))
      .limit(1),
  )
  const recipientRole = yield* memberRole(input.workspaceId, input.userId).pipe(Effect.catchTag('MemberUnavailable', () => Effect.succeed('guest' as const)))
  const target = { workspaceId: input.workspaceId, resourceId: input.projectId, role: recipientRole, grantedByUserId: grants[0]?.grantedByUserId ?? null }
  yield* authorize({ ...base, action: { kind: 'revokeProjectAccess', target } })
  if (grants[0] === undefined) return { revoked: false }
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, stillRole(input.workspaceId, caller.userId, [role])),
    d.delete(schema.projectAccess).where(and(eq(schema.projectAccess.projectId, input.projectId), eq(schema.projectAccess.userId, input.userId))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'project', targetId: input.projectId, action: 'project.access_revoked', at: base.now }, activityId),
  ])
  return { revoked: true }
})
