import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { ResourceUnavailable } from '../errors'
import { decidePermission, type FileGrant, type PermissionAction, type PermissionInput, type ProjectGrant } from '../permissions'
import type { FileView, GuestFileView, PersonName } from '../../shared/fileViews'
import { type Database, Db } from '../services/Db'
import {
  type Caller, fileForPermission, fileGrantOf, loadProject, nowSeconds, opt, permissionActor, projectForPermission, projectGrantOf,
  projectStill, requireMembership, toSeconds,
} from './shared'

export type FullFileRow = typeof schema.files.$inferSelect

/** A file of this workspace that finished uploading (trashed or not). Pending or foreign ids are unavailable. */
export const loadLiveRow = Effect.fnUntraced(function* (workspaceId: string, fileId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.files)
      .where(and(eq(schema.files.id, fileId), eq(schema.files.workspaceId, workspaceId), eq(schema.files.status, 'uploaded')))
      .limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new ResourceUnavailable()
  return row
})

/**
 * Membership, the file and everything a decision on it needs (its project and the caller's grants on both), plus `still`:
 * the write-time recheck that the file is still where and in the state (`trashed`) the decision was made for.
 */
export const openFile = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, fileId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const file = yield* loadLiveRow(workspaceId, fileId)
  const project = file.projectId === null ? undefined : yield* loadProject(workspaceId, file.projectId)
  const projectGrant = project === undefined ? undefined : yield* projectGrantOf(workspaceId, project.id, caller.userId)
  const fileGrant = yield* fileGrantOf(workspaceId, fileId, caller.userId)
  const base = {
    actor: permissionActor(caller, workspaceId, role),
    workspace,
    file: fileForPermission(file, workspaceId),
    ...opt('project', project === undefined ? undefined : projectForPermission(project)),
    ...opt('projectGrant', projectGrant),
    ...opt('fileGrant', fileGrant),
    now: yield* nowSeconds,
  } satisfies Omit<PermissionInput, 'action'>
  const projectPart = project === undefined ? sql`1` : projectStill(project.id, project.accessMode)
  const still = (trashed: boolean) =>
    sql`EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND workspaceId = ${workspaceId} AND status = 'uploaded'
      AND isDeleted = ${trashed ? 1 : 0} AND projectId IS ${file.projectId}) AND ${projectPart}`
  return { workspace, role, file, project, base, still }
})

export const can = (base: Omit<PermissionInput, 'action'>, action: PermissionAction) => decidePermission({ ...base, action }).allowed

export interface GrantWithName<G> {
  readonly grant: G
  /** Display name of whoever gave the grant; null when that user is gone. */
  readonly grantorName: string | null
}

/** The caller's project grants in the workspace, keyed by project id. */
export const projectGrantsOf = Effect.fnUntraced(function* (workspaceId: string, userId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({ g: schema.projectAccess, name: schema.user.name }).from(schema.projectAccess)
      .leftJoin(schema.user, eq(schema.user.id, schema.projectAccess.grantedByUserId))
      .where(and(eq(schema.projectAccess.workspaceId, workspaceId), eq(schema.projectAccess.userId, userId))),
  )
  return new Map(rows.map(({ g, name }): [string, GrantWithName<ProjectGrant>] => [g.projectId, {
    grant: { workspaceId: g.workspaceId, projectId: g.projectId, userId: g.userId, level: g.level, expiresAt: g.expiresAt === null ? null : toSeconds(g.expiresAt) },
    grantorName: name,
  }]))
})

/** The caller's file grants on `fileIds` (at most 50 at a time), keyed by file id. */
export const fileGrantsOf = Effect.fnUntraced(function* (workspaceId: string, userId: string, fileIds: ReadonlyArray<string>) {
  if (fileIds.length === 0) return new Map<string, GrantWithName<FileGrant>>()
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({ g: schema.fileAccess, name: schema.user.name }).from(schema.fileAccess)
      .leftJoin(schema.user, eq(schema.user.id, schema.fileAccess.grantedByUserId))
      .where(and(eq(schema.fileAccess.workspaceId, workspaceId), eq(schema.fileAccess.userId, userId), inArray(schema.fileAccess.fileId, [...fileIds]))),
  )
  return new Map(rows.map(({ g, name }): [string, GrantWithName<FileGrant>] => [g.fileId, {
    grant: { workspaceId: g.workspaceId, fileId: g.fileId, userId: g.userId, level: g.level, source: g.source, expiresAt: g.expiresAt === null ? null : toSeconds(g.expiresAt) },
    grantorName: name,
  }]))
})

/** Everything needed to decide on many files of one workspace without a query per file. */
export const loadScope = Effect.fnUntraced(function* (caller: Caller, workspaceId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const db = yield* Db
  const projects = new Map((yield* db.use((d) => d.select().from(schema.projects).where(eq(schema.projects.workspaceId, workspaceId)))).map((p) => [p.id, p]))
  return {
    workspace, role, now: yield* nowSeconds, projects,
    projectGrants: yield* projectGrantsOf(workspaceId, caller.userId),
    actor: permissionActor(caller, workspaceId, role),
  }
})
export type Scope = Effect.Success<ReturnType<typeof loadScope>>

/** The decision input for one file row, or undefined when its project is missing (it then counts as hidden). */
export const scopedInput = (
  scope: Scope,
  row: { readonly id: string; readonly projectId: string | null; readonly isDeleted: boolean },
  fileGrant: GrantWithName<FileGrant> | undefined,
): Omit<PermissionInput, 'action'> | undefined => {
  const project = row.projectId === null ? undefined : scope.projects.get(row.projectId)
  if (row.projectId !== null && project === undefined) return undefined
  return {
    actor: scope.actor,
    workspace: scope.workspace,
    file: fileForPermission({ id: row.id, workspaceId: scope.workspace.id, projectId: row.projectId, isDeleted: row.isDeleted, status: 'uploaded' }, scope.workspace.id),
    ...opt('project', project === undefined ? undefined : projectForPermission(project)),
    ...opt('projectGrant', row.projectId === null ? undefined : scope.projectGrants.get(row.projectId)?.grant),
    ...opt('fileGrant', fileGrant?.grant),
    now: scope.now,
  }
}

/** The columns of a file's summary: no key, no user id. `me` is the caller (for the star). */
export const summarySelect = (d: Database, me: string, sortKey: SQL = sql`0`) => {
  const f = schema.files
  return d.select({
    id: f.id,
    name: f.name,
    extension: f.extension,
    size: f.size,
    projectId: f.projectId,
    projectName: schema.projects.name,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    isDeleted: f.isDeleted,
    sortValue: sql<string | number>`${sortKey}`,
    uploaderName: schema.user.name,
    starred: sql<number>`EXISTS (SELECT 1 FROM file_stars s WHERE s.fileId = ${f.id} AND s.userId = ${me})`,
    hasThumbnail: sql<number>`${f.thumbnailR2Key} IS NOT NULL`,
    // NULL currentVersionNumber is a legacy row: COUNT(file_versions) + 1 (docs/09 §1.4).
    versionNumber: sql<number>`COALESCE(${f.currentVersionNumber}, (SELECT count(*) FROM file_versions v WHERE v.fileId = ${f.id}) + 1)`,
  }).from(f)
    .leftJoin(schema.user, eq(schema.user.id, sql`COALESCE(${f.currentUploadedByUserId}, ${f.userId})`))
    .leftJoin(schema.projects, eq(schema.projects.id, f.projectId))
}

export type SummaryRow = Awaited<ReturnType<ReturnType<typeof summarySelect>['limit']>>[number]

const person = (name: string | null): PersonName | null => name === null ? null : { displayName: name }

/** Internal projection (allow-list, field by field). */
export const internalView = (row: SummaryRow, base: Omit<PermissionInput, 'action'>): FileView => ({
  id: row.id,
  name: row.name,
  extension: row.extension,
  size: row.size,
  projectId: row.projectId,
  projectName: row.projectName,
  createdAt: toSeconds(row.createdAt),
  updatedAt: toSeconds(row.updatedAt),
  starred: row.starred === 1,
  thumbnailAvailable: row.hasThumbnail === 1,
  currentVersion: { number: row.versionNumber, uploadedBy: person(row.uploaderName) },
  can: {
    edit: can(base, { kind: 'edit' }),
    comment: can(base, { kind: 'comment' }),
    download: can(base, { kind: 'download' }),
    viewHistory: can(base, { kind: 'viewHistory' }),
    trash: can(base, { kind: 'trashFile' }),
    share: can(base, { kind: 'shareFile' }),
  },
})

/** Guest projection (allow-list, field by field; docs/09 §3.5). `sharedBy` falls back to the workspace's name. */
export const guestView = (row: SummaryRow, base: Omit<PermissionInput, 'action'>, sharedBy: string): GuestFileView => ({
  id: row.id,
  name: row.name,
  extension: row.extension,
  size: row.size,
  updatedAt: toSeconds(row.updatedAt),
  currentVersion: { number: row.versionNumber },
  thumbnailAvailable: row.hasThumbnail === 1,
  can: { download: can(base, { kind: 'download' }), comment: can(base, { kind: 'comment' }) },
  sharedBy: { displayName: sharedBy },
})

export const personOf = person
