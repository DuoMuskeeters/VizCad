import { type AnyColumn, and, eq, gt, or, type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { Clock, Effect, Option, Predicate } from 'effect'
import * as schema from '../db/schema'
import {
  DbError,
  LastOwner,
  PermissionDenied,
  ResourceUnavailable,
  WorkspaceUnavailable,
  WriteConflict,
} from '../errors'
import { type DenialReason, decidePermission, type PermissionInput, type WorkspaceRole } from '../permissions'
import { type Database, Db } from '../services/Db'

/** The signed-in caller, resolved by the HTTP layer from the session. Never carries product permission. */
export interface Caller {
  readonly userId: string
  readonly email: string
  readonly emailVerified: boolean
  /** `cf-ray`, stored on activity rows. */
  readonly requestId: string
  /** `cf-connecting-ip`, for rate limits only (never stored). */
  readonly ip: string | null
}

export const internalRoles = ['owner', 'admin', 'member', 'commenter'] as const satisfies ReadonlyArray<WorkspaceRole>

/** UTC Unix seconds from Effect's Clock (TestClock in tests). */
export const nowSeconds = Clock.currentTimeMillis.pipe(Effect.map((ms) => Math.floor(ms / 1000)))
export const toDate = (seconds: number) => new Date(seconds * 1000)
export const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000)
export const newId = Effect.sync(() => crypto.randomUUID())

export interface WorkspaceRow {
  readonly id: string
  readonly name: string
  readonly kind: 'personal' | 'company'
  readonly archived: boolean
}

/** The workspace and the caller's current role in it. Missing, archived or no membership: one answer. */
export const requireMembership = Effect.fnUntraced(function* (workspaceId: string, userId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d
      .select({ id: schema.organization.id, name: schema.organization.name, kind: schema.organization.kind, archivedAt: schema.organization.archivedAt, role: schema.member.role })
      .from(schema.organization)
      .innerJoin(schema.member, and(eq(schema.member.organizationId, schema.organization.id), eq(schema.member.userId, userId)))
      .where(eq(schema.organization.id, workspaceId))
      .limit(1),
  )
  const row = rows[0]
  if (row === undefined || row.archivedAt !== null) return yield* new WorkspaceUnavailable()
  const workspace: WorkspaceRow = { id: row.id, name: row.name, kind: row.kind, archived: false }
  return { workspace, role: row.role }
})

export const permissionActor = (caller: Caller, workspaceId: string, role: string) =>
  ({ kind: 'member', userId: caller.userId, workspaceId, role, emailVerified: caller.emailVerified }) as const

const hidden: ReadonlySet<DenialReason> = new Set([
  'RESOURCE_UNAVAILABLE', 'TENANT_MISMATCH', 'NO_MEMBERSHIP', 'VERSION_UNAVAILABLE', 'LINK_EXPIRED', 'LINK_REVOKED', 'LINK_PROOF_REQUIRED',
])

/** Runs permissions.ts (the only place with rules) and turns a denial into a tagged error. */
export const authorize = (input: PermissionInput): Effect.Effect<void, LastOwner | ResourceUnavailable | PermissionDenied> => {
  const decision = decidePermission(input)
  if (decision.allowed) return Effect.void
  if (decision.reason === 'LAST_OWNER') return Effect.fail(new LastOwner())
  if (hidden.has(decision.reason)) return Effect.fail(new ResourceUnavailable())
  return Effect.fail(new PermissionDenied({ reason: decision.reason }))
}

/** Every message in an error's cause chain (Drizzle wraps the D1/SQLite error). */
const messages = (error: unknown) => {
  const out: Array<string> = []
  let current: unknown = error
  for (let depth = 0; depth < 6 && Predicate.isObject(current); depth++) {
    if (Predicate.hasProperty(current, 'message') && Predicate.isString(current.message)) out.push(current.message)
    current = Predicate.hasProperty(current, 'cause') ? current.cause : undefined
  }
  return out.join('\n')
}

/** True when a DbError came from the named constraint (`UNIQUE constraint failed: organization.slug`, a CHECK name, ...). */
export const violates = (error: DbError, constraint: string) => messages(error.cause).includes(constraint)

type Statements = (d: Database) => ReadonlyArray<BatchItem<'sqlite'>>

/**
 * One atomic D1 batch. A failed `guard` (batch_guard CHECK) becomes WriteConflict: nothing was written. Other
 * constraint failures can be mapped with `onConstraint` (constraint text -> error); the rest stay DbError.
 */
export const runBatch = <E = never>(statements: Statements, onConstraint: ReadonlyArray<readonly [string, () => E]> = []) =>
  Effect.gen(function* () {
    const db = yield* Db
    return yield* db
      .use(async (d): Promise<void> => {
        const [first, ...rest] = statements(d)
        if (first !== undefined) await d.batch([first, ...rest])
      })
      .pipe(
        Effect.catchTag('DbError', (error): Effect.Effect<never, DbError | WriteConflict | E> => {
          if (violates(error, 'batch_guard_failed')) return Effect.fail(new WriteConflict())
          const mapped = onConstraint.find(([constraint]) => violates(error, constraint))
          return mapped ? Effect.fail(mapped[1]()) : Effect.fail(error)
        }),
      )
  })

/** A batch statement that aborts the batch unless `condition` holds at write time. */
export const guard = (d: Database, condition: SQL) =>
  d.insert(schema.batchGuard).values({ ok: sql`CASE WHEN ${condition} THEN 1 ELSE 0 END` })

const list = (values: ReadonlyArray<string>) => sql.join(values.map((v) => sql`${v}`), sql`, `)

/** Write-time recheck: the user still has one of `roles` in a live (unarchived) workspace. */
export const stillRole = (workspaceId: string, userId: string, roles: ReadonlyArray<string>) =>
  sql`EXISTS (SELECT 1 FROM member m JOIN organization o ON o.id = m.organizationId
    WHERE m.organizationId = ${workspaceId} AND m.userId = ${userId} AND o.archivedAt IS NULL
    AND m.role IN (${list(roles)}))`

/** Write-time recheck that a project is live and still in the mode the decision was made for. */
export const projectStill = (projectId: string, accessMode: string) =>
  sql`EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND archivedAt IS NULL AND accessMode = ${accessMode})`

export interface ActivityInput {
  readonly workspaceId: string
  readonly caller: Caller
  readonly targetKind: 'workspace' | 'member' | 'invitation' | 'guest_invitation' | 'project' | 'file'
  readonly targetId: string
  readonly action: string
  readonly at: number
}

/**
 * The activity row (docs/08 §2 `access_log`) for a state change; goes into the same batch as the change, so a
 * failed transition writes no activity. Only ids and fixed action names, never names, emails or tokens.
 */
export const activity = (d: Database, input: ActivityInput, id: string) =>
  d.insert(schema.accessLog).values({
    id,
    workspaceId: input.workspaceId,
    actorKind: 'user',
    actorUserId: input.caller.userId,
    linkId: null,
    targetKind: input.targetKind,
    targetId: input.targetId,
    action: input.action,
    outcome: 'allowed',
    requestId: input.caller.requestId,
    createdAt: toDate(input.at),
    reason: null,
  })

/** `{ [key]: value }` or `{}`: optional properties without `undefined` (exactOptionalPropertyTypes). */
export const opt = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: V }

/** The caller's live grant on a project (for permission input). */
export const projectGrantOf = Effect.fnUntraced(function* (workspaceId: string, projectId: string, userId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.projectAccess)
      .where(and(eq(schema.projectAccess.workspaceId, workspaceId), eq(schema.projectAccess.projectId, projectId), eq(schema.projectAccess.userId, userId)))
      .limit(1),
  )
  return Option.fromNullishOr(rows[0]).pipe(
    Option.map((g) => ({ workspaceId: g.workspaceId, projectId: g.projectId, userId: g.userId, level: g.level, expiresAt: g.expiresAt === null ? null : toSeconds(g.expiresAt) })),
    Option.getOrUndefined,
  )
})

export const fileGrantOf = Effect.fnUntraced(function* (workspaceId: string, fileId: string, userId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.fileAccess)
      .where(and(eq(schema.fileAccess.workspaceId, workspaceId), eq(schema.fileAccess.fileId, fileId), eq(schema.fileAccess.userId, userId)))
      .limit(1),
  )
  return Option.fromNullishOr(rows[0]).pipe(
    Option.map((g) => ({ workspaceId: g.workspaceId, fileId: g.fileId, userId: g.userId, level: g.level, source: g.source, expiresAt: g.expiresAt === null ? null : toSeconds(g.expiresAt) })),
    Option.getOrUndefined,
  )
})

export type ProjectRow = typeof schema.projects.$inferSelect

export const projectForPermission = (p: ProjectRow) => ({
  id: p.id,
  workspaceId: p.workspaceId,
  accessMode: p.accessMode,
  archived: p.archivedAt !== null,
  createdByUserId: p.createdByUserId,
  creatorManagerUserId: p.creatorManagerUserId,
})

/** A project of this workspace, or ResourceUnavailable (same answer for another workspace's id). */
export const loadProject = Effect.fnUntraced(function* (workspaceId: string, projectId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.workspaceId, workspaceId))).limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new ResourceUnavailable()
  return row
})

export type FileRow = Pick<typeof schema.files.$inferSelect, 'id' | 'workspaceId' | 'projectId' | 'isDeleted' | 'status'>

export const loadFile = Effect.fnUntraced(function* (workspaceId: string, fileId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({ id: schema.files.id, workspaceId: schema.files.workspaceId, projectId: schema.files.projectId, isDeleted: schema.files.isDeleted, status: schema.files.status })
      .from(schema.files).where(and(eq(schema.files.id, fileId), eq(schema.files.workspaceId, workspaceId))).limit(1),
  )
  const row = rows[0]
  if (row === undefined) return yield* new ResourceUnavailable()
  return row
})

export const fileForPermission = (f: FileRow, workspaceId: string) => ({
  id: f.id,
  workspaceId,
  projectId: f.projectId,
  trashed: f.isDeleted,
  // Versions arrive in Faz 4; until then an uploaded file counts as having a ready current version.
  currentReadyVersionId: f.status === 'uploaded' ? f.id : null,
})

/** SQL: the guest still has at least one live grant in the workspace (project or file). */
export const liveGuestScope = (workspaceId: string | AnyColumn, userId: string | AnyColumn, now: number) =>
  or(
    sql`EXISTS (SELECT 1 FROM project_access pa JOIN projects p ON p.id = pa.projectId
      WHERE pa.workspaceId = ${workspaceId} AND pa.userId = ${userId} AND pa.expiresAt IS NOT NULL AND pa.expiresAt > ${now}
      AND p.archivedAt IS NULL)`,
    sql`EXISTS (SELECT 1 FROM file_access fa JOIN files f ON f.id = fa.fileId
      WHERE fa.workspaceId = ${workspaceId} AND fa.userId = ${userId} AND fa.expiresAt IS NOT NULL AND fa.expiresAt > ${now}
      AND f.isDeleted = 0
      AND (f.projectId IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = f.projectId AND p.archivedAt IS NULL)))`,
  )

export const notExpired = (column: typeof schema.invitation.expiresAt | typeof schema.resourceInvitations.expiresAt, now: number) =>
  gt(column, toDate(now))

export const pendingInvitation = (now: number) =>
  and(eq(schema.invitation.status, 'pending'), notExpired(schema.invitation.expiresAt, now))

