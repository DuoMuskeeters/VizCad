import { alias } from 'drizzle-orm/sqlite-core'
import { and, asc, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { AccessExpiryInvalid, AlreadyHasAccess, InvalidAccessLevel, MemberUnavailable } from '../errors'
import { type AccessLevel, decidePermission, type PermissionInput } from '../permissions'
import type { FileAccessEntry, FileAccessList } from '../../shared/fileViews'
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
  toSeconds,
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
  // The uploader row is ownership, not a grant: refuse instead of writing an activity row for a no-op.
  const held = yield* fileGrantOf(input.workspaceId, input.fileId, input.userId)
  if (held?.source === 'uploader') return yield* new AlreadyHasAccess()
  const at = toDate(base.now)
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${stillRole(input.workspaceId, input.userId, [recipientRole])} AND ${still}
      AND NOT EXISTS (SELECT 1 FROM file_access WHERE fileId = ${input.fileId} AND userId = ${input.userId} AND source = 'uploader')`),
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

type Target = { readonly kind: 'file'; readonly id: string } | { readonly kind: 'project'; readonly id: string }

const isLevel = (level: string): level is FileAccessEntry['level'] => level === 'view' || level === 'comment' || level === 'download' || level === 'edit'
const isRole = (role: string): role is FileAccessEntry['role'] => role === 'owner' || role === 'admin' || role === 'member' || role === 'commenter' || role === 'guest'

/**
 * The access list of a file or project (docs/09 §5.1, D20). Who may see the other people is the sharing right itself
 * (`shareFile` / `manageProjectAccess`): without it, and always for a guest, the answer holds only the caller's own row.
 * Expired grants stay in the list (flagged) until somebody removes them; pending guest invitations come with it. Rows are
 * allow-listed field by field; no token or invitation digest leaves here.
 */
const accessList = (caller: Caller, workspaceId: string, target: Target, base: Omit<PermissionInput, 'action'>, role: string) =>
  Effect.gen(function* () {
    const input = base
    const manage = decidePermission({ ...input, action: { kind: target.kind === 'file' ? 'shareFile' : 'manageProjectAccess' } }).allowed && role !== 'guest'
    const db = yield* Db
    const granter = alias(schema.user, 'granter')
    const rows = target.kind === 'file'
      ? yield* db.use((d) =>
        d.select({
          userId: schema.fileAccess.userId, name: schema.user.name, email: schema.user.email, role: schema.member.role, level: schema.fileAccess.level,
          source: schema.fileAccess.source, expiresAt: schema.fileAccess.expiresAt, grantedBy: granter.name, grantedByUserId: schema.fileAccess.grantedByUserId,
        }).from(schema.fileAccess)
          .innerJoin(schema.member, and(eq(schema.member.organizationId, schema.fileAccess.workspaceId), eq(schema.member.userId, schema.fileAccess.userId)))
          .innerJoin(schema.user, eq(schema.user.id, schema.fileAccess.userId))
          .leftJoin(granter, eq(granter.id, schema.fileAccess.grantedByUserId))
          .where(and(eq(schema.fileAccess.workspaceId, workspaceId), eq(schema.fileAccess.fileId, target.id), manage ? undefined : eq(schema.fileAccess.userId, caller.userId)))
          .orderBy(sql`CASE ${schema.fileAccess.source} WHEN 'uploader' THEN 0 ELSE 1 END`, asc(schema.fileAccess.createdAt), asc(schema.fileAccess.userId))
          .limit(200),
      )
      : yield* db.use((d) =>
        d.select({
          userId: schema.projectAccess.userId, name: schema.user.name, email: schema.user.email, role: schema.member.role, level: schema.projectAccess.level,
          source: sql<string>`'grant'`, expiresAt: schema.projectAccess.expiresAt, grantedBy: granter.name, grantedByUserId: schema.projectAccess.grantedByUserId,
        }).from(schema.projectAccess)
          .innerJoin(schema.member, and(eq(schema.member.organizationId, schema.projectAccess.workspaceId), eq(schema.member.userId, schema.projectAccess.userId)))
          .innerJoin(schema.user, eq(schema.user.id, schema.projectAccess.userId))
          .leftJoin(granter, eq(granter.id, schema.projectAccess.grantedByUserId))
          .where(and(eq(schema.projectAccess.workspaceId, workspaceId), eq(schema.projectAccess.projectId, target.id), manage ? undefined : eq(schema.projectAccess.userId, caller.userId)))
          .orderBy(asc(schema.projectAccess.createdAt), asc(schema.projectAccess.userId))
          .limit(200),
      )
    const people: FileAccessEntry[] = []
    for (const row of rows) {
      if (!isLevel(row.level) || !isRole(row.role)) continue
      const expiresAt = row.expiresAt === null ? null : toSeconds(row.expiresAt)
      const grant = { workspaceId, resourceId: target.id, role: row.role, grantedByUserId: row.grantedByUserId }
      const canRevoke = row.source === 'grant' && decidePermission({ ...input, action: { kind: target.kind === 'file' ? 'revokeFileAccess' : 'revokeProjectAccess', target: grant } }).allowed
      people.push({
        userId: row.userId, name: row.name, email: row.email, role: row.role, level: row.level, source: row.source === 'uploader' ? 'uploader' : 'grant',
        expiresAt, expired: expiresAt !== null && expiresAt <= input.now, grantedBy: row.grantedBy === null ? null : { displayName: row.grantedBy },
        self: row.userId === caller.userId, canRevoke,
      })
    }
    const invites = manage
      ? yield* db.use((d) =>
        d.select({ id: schema.resourceInvitations.id, email: schema.resourceInvitations.email, level: schema.resourceInvitations.level, accessExpiresAt: schema.resourceInvitations.accessExpiresAt })
          .from(schema.resourceInvitations)
          .where(and(
            eq(schema.resourceInvitations.workspaceId, workspaceId), eq(schema.resourceInvitations.status, 'pending'),
            target.kind === 'file' ? eq(schema.resourceInvitations.fileId, target.id) : eq(schema.resourceInvitations.projectId, target.id),
            sql`${schema.resourceInvitations.expiresAt} > ${input.now}`,
          ))
          .orderBy(asc(schema.resourceInvitations.createdAt), asc(schema.resourceInvitations.id))
          .limit(100),
      )
      : []
    return {
      canManage: manage, people,
      invitations: invites.map((i) => ({ id: i.id, email: i.email, level: i.level, accessExpiresAt: toSeconds(i.accessExpiresAt) })),
    } satisfies FileAccessList
  })

/** Who can open this file (docs/09 §5.1): needs `view`; the other people only with the right to share (D20). */
export const listFileAccess = Effect.fn('listFileAccess')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { role, base } = yield* fileContext(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  return yield* accessList(caller, input.workspaceId, { kind: 'file', id: input.fileId }, base, role)
})

/** Who holds a grant on this project; same rules as `listFileAccess`. */
export const listProjectAccess = Effect.fn('listProjectAccess')(function* (caller: Caller, input: { readonly workspaceId: string; readonly projectId: string }) {
  const { role, base } = yield* projectContext(caller, input.workspaceId, input.projectId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  return yield* accessList(caller, input.workspaceId, { kind: 'project', id: input.projectId }, base, role)
})
