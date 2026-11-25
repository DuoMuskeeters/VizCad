import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { PermissionDenied, ProjectLimitReached } from '../errors'
import { decidePermission } from '../permissions'
import type { ProjectList } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { loadScope } from './fileContext'
import {
  activity,
  authorize,
  type Caller,
  guard,
  loadProject,
  newId,
  nowSeconds,
  opt,
  permissionActor,
  projectForPermission,
  requireMembership,
  runBatch,
  stillRole,
  toDate,
  toSeconds,
} from './shared'

export type AccessMode = 'team' | 'restricted'

const liveProjects = (workspaceId: string) =>
  sql`(SELECT count(*) FROM projects WHERE workspaceId = ${workspaceId} AND archivedAt IS NULL)`

const featureCheck = Effect.fnUntraced(function* (workspaceId: string, accessMode: AccessMode) {
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  if (accessMode === 'restricted' && !limits.restrictedProjects) return yield* new PermissionDenied({ reason: 'FEATURE_UNAVAILABLE' })
  return limits
})

/**
 * Creates a project (default "all team"). When an ordinary member creates it, the creator-manager mark and the creator's
 * `edit` project grant are written in the same batch (docs/08 §4.3). The project limit is re-checked at write time.
 */
export const createProject = Effect.fn('createProject')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly name: string; readonly description: string | null; readonly accessMode: AccessMode },
) {
  const { workspace, role } = yield* requireMembership(input.workspaceId, caller.userId)
  const now = yield* nowSeconds
  yield* authorize({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'createProject' } })
  const limits = yield* featureCheck(workspace.id, input.accessMode)
  const db = yield* Db
  if (limits.projects !== null) {
    const row = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${liveProjects(workspace.id)} AS n`))
    if ((row?.n ?? 0) >= limits.projects) return yield* new ProjectLimitReached()
  }
  const id = yield* newId
  const activityId = yield* newId
  const at = toDate(now)
  const creatorManages = role === 'member'
  const conditions = [stillRole(workspace.id, caller.userId, [role]), ...(limits.projects === null ? [] : [sql`${liveProjects(workspace.id)} < ${limits.projects}`])]
  yield* runBatch((d) => [
    guard(d, sql.join(conditions, sql` AND `)),
    d.insert(schema.projects).values({
      id, workspaceId: workspace.id, name: input.name, description: input.description, accessMode: input.accessMode,
      createdByUserId: caller.userId, creatorManagerUserId: creatorManages ? caller.userId : null, createdAt: at, updatedAt: at,
    }),
    ...(creatorManages
      ? [d.insert(schema.projectAccess).values({ workspaceId: workspace.id, projectId: id, userId: caller.userId, level: 'edit', expiresAt: null, grantedByUserId: caller.userId, createdAt: at, updatedAt: at })]
      : []),
    activity(d, { workspaceId: workspace.id, caller, targetKind: 'project', targetId: id, action: 'project.created', at: now }, activityId),
  ])
  return { id, name: input.name, description: input.description, accessMode: input.accessMode }
})

/** Owner/admin decision on a live project of this workspace (project settings and access mode). */
const manageProject = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, projectId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const project = yield* loadProject(workspaceId, projectId)
  const now = yield* nowSeconds
  yield* authorize({ actor: permissionActor(caller, workspace.id, role), workspace, project: projectForPermission(project), now, action: { kind: 'updateProject' } })
  const still = sql`${stillRole(workspaceId, caller.userId, [role])} AND EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND archivedAt IS NULL)`
  return { project, now, still }
})

export const updateProject = Effect.fn('updateProject')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly projectId: string; readonly name?: string; readonly description?: string | null },
) {
  const { project, now, still } = yield* manageProject(caller, input.workspaceId, input.projectId)
  const name = input.name ?? project.name
  const description = input.description === undefined ? project.description : input.description
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, still),
    d.update(schema.projects).set({ name, description, updatedAt: toDate(now) }).where(eq(schema.projects.id, project.id)),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'project', targetId: project.id, action: 'project.updated', at: now }, activityId),
  ])
  return { id: project.id, name, description, accessMode: project.accessMode }
})

/** Archiving closes ordinary access to the project and its files (permissions.ts), without deleting anything. */
export const archiveProject = Effect.fn('archiveProject')(function* (caller: Caller, input: { readonly workspaceId: string; readonly projectId: string }) {
  const { project, now, still } = yield* manageProject(caller, input.workspaceId, input.projectId)
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, still),
    d.update(schema.projects).set({ archivedAt: toDate(now), updatedAt: toDate(now) }).where(and(eq(schema.projects.id, project.id), isNull(schema.projects.archivedAt))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'project', targetId: project.id, action: 'project.archived', at: now }, activityId),
  ])
  return { id: project.id, archived: true }
})

/**
 * Switches between "all team" and "invited only". Going restricted (docs/08 §4.5) revokes the live links of the
 * project's files, cancels their pending guest invitations and removes their ordinary file grants, all in the same batch;
 * uploader grants and the project's own grants stay. New sharing needs an explicit act of a current project manager.
 */
export const setProjectAccessMode = Effect.fn('setProjectAccessMode')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly projectId: string; readonly accessMode: AccessMode },
) {
  const { project, now, still } = yield* manageProject(caller, input.workspaceId, input.projectId)
  yield* featureCheck(input.workspaceId, input.accessMode)
  if (project.accessMode === input.accessMode) return { id: project.id, accessMode: input.accessMode }
  const at = toDate(now)
  const projectFiles = (d: Parameters<Parameters<typeof runBatch>[0]>[0]) =>
    d.select({ id: schema.files.id }).from(schema.files).where(and(eq(schema.files.workspaceId, input.workspaceId), eq(schema.files.projectId, project.id)))
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${still} AND EXISTS (SELECT 1 FROM projects WHERE id = ${project.id} AND accessMode = ${project.accessMode})`),
    ...(input.accessMode === 'restricted'
      ? [
        d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
          .where(and(eq(schema.shareLinks.workspaceId, input.workspaceId), inArray(schema.shareLinks.fileId, projectFiles(d)), isNull(schema.shareLinks.revokedAt))),
        d.update(schema.resourceInvitations).set({ status: 'canceled' })
          .where(and(eq(schema.resourceInvitations.workspaceId, input.workspaceId), inArray(schema.resourceInvitations.fileId, projectFiles(d)), eq(schema.resourceInvitations.status, 'pending'))),
        d.delete(schema.fileAccess)
          .where(and(eq(schema.fileAccess.workspaceId, input.workspaceId), inArray(schema.fileAccess.fileId, projectFiles(d)), eq(schema.fileAccess.source, 'grant'))),
      ]
      : []),
    d.update(schema.projects).set({ accessMode: input.accessMode, updatedAt: at }).where(eq(schema.projects.id, project.id)),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'project', targetId: project.id, action: `project.access_mode_${input.accessMode}`, at: now }, activityId),
  ])
  return { id: project.id, accessMode: input.accessMode }
})

/**
 * The workspace's live projects the caller can open (docs/08 §4): each one goes through permissions.ts `view`, so a
 * restricted project shows only to people with a grant (or an owner/admin) and a guest only gets the projects they hold a
 * grant on. A file grant alone never lists its project. Name order; file counts come from one grouped query. `can` carries
 * the answers the screen needs for "disabled + why".
 */
export const listProjects = Effect.fn('listProjects')(function* (caller: Caller, input: { readonly workspaceId: string }) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const db = yield* Db
  const [rows, counts] = yield* db.use((d) =>
    Promise.all([
      d.select({ project: schema.projects, creator: schema.user.name }).from(schema.projects)
        .leftJoin(schema.user, eq(schema.user.id, schema.projects.createdByUserId))
        .where(and(eq(schema.projects.workspaceId, input.workspaceId), isNull(schema.projects.archivedAt)))
        .orderBy(sql`lower(${schema.projects.name})`, schema.projects.id),
      d.select({ projectId: schema.files.projectId, n: sql<number>`count(*)` }).from(schema.files)
        .where(and(eq(schema.files.workspaceId, input.workspaceId), eq(schema.files.isDeleted, false), eq(schema.files.status, 'uploaded'), sql`${schema.files.projectId} IS NOT NULL`))
        .groupBy(schema.files.projectId),
    ]),
  )
  const countOf = new Map(counts.map((c) => [c.projectId, c.n]))
  const items: ProjectList['items'][number][] = []
  for (const { project, creator } of rows) {
    const base = {
      actor: scope.actor, workspace: scope.workspace, project: projectForPermission(project), now: scope.now,
      ...opt('projectGrant', scope.projectGrants.get(project.id)?.grant),
    }
    const allowed = (kind: 'view' | 'updateProject' | 'manageProjectAccess' | 'uploadProjectFile') => decidePermission({ ...base, action: { kind } }).allowed
    if (!allowed('view')) continue
    items.push({
      id: project.id, name: project.name, description: project.description, accessMode: project.accessMode,
      fileCount: countOf.get(project.id) ?? 0, createdBy: creator === null ? null : { displayName: creator },
      createdAt: toSeconds(project.createdAt), updatedAt: toSeconds(project.updatedAt),
      can: { update: allowed('updateProject'), manageAccess: allowed('manageProjectAccess'), upload: allowed('uploadProjectFile') },
    })
  }
  return { items } satisfies ProjectList
})
