import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { EmailUnverified, SlugTaken, WorkspaceLimitReached, WorkspaceUnavailable } from '../errors'
import { Auth } from '../services/Auth'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { RateLimit } from '../services/RateLimit'
import { activity, type Caller, guard, liveGuestScope, newId, nowSeconds, runBatch, toDate } from './shared'

/** Deterministic personal workspace ids: the backfill script (scripts/backfillPersonalWorkspaces.ts) uses the same scheme. */
export const personalWorkspaceId = (userId: string) => `personal-${userId}`
export const personalSlug = (userId: string) => `personal-${userId}`
export const personalOwnerMemberId = (userId: string) => `personal-owner-${userId}`

/** URL slug from a display name plus a random suffix; never in the `personal-` namespace. */
export const slugFrom = (name: string, suffix: string) => {
  const base = name.replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
  const safe = base === '' ? 'workspace' : base.startsWith('personal') ? `w-${base}` : base
  return `${safe}-${suffix}`
}

/** SQL: how many live company workspaces the user owns (read before the batch and re-checked in it). */
const ownedCompanies = (userId: string) =>
  sql`(SELECT count(*) FROM member m JOIN organization o ON o.id = m.organizationId
    WHERE m.userId = ${userId} AND m.role = 'owner' AND o.kind = 'company' AND o.archivedAt IS NULL)`

/** Company workspace with its founder as the single owner, atomically, plus the activity row. */
export const createWorkspace = Effect.fn('createWorkspace')(function* (caller: Caller, input: { readonly name: string }) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const limits = yield* (yield* Entitlements).userLimits(caller.userId)
  const limiter = yield* RateLimit
  yield* limiter.hit({ action: 'createWorkspace', ip: caller.ip })
  yield* limiter.hit({ action: 'createWorkspace', target: caller.userId, targetRule: { limit: limits.workspaceCreatesPerDay, windowSeconds: 24 * 60 * 60 } })
  const db = yield* Db
  const owned = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${ownedCompanies(caller.userId)} AS n`))
  if ((owned?.n ?? 0) >= limits.ownedWorkspaces) return yield* new WorkspaceLimitReached()
  const now = yield* nowSeconds
  const id = yield* newId
  const slug = slugFrom(input.name, (yield* newId).slice(0, 8))
  const memberId = yield* newId
  const activityId = yield* newId
  yield* runBatch(
    (d) => [
      guard(d, sql`${ownedCompanies(caller.userId)} < ${limits.ownedWorkspaces}`),
      d.insert(schema.organization).values({ id, name: input.name, slug, createdAt: toDate(now), kind: 'company' }),
      d.insert(schema.member).values({ id: memberId, organizationId: id, userId: caller.userId, role: 'owner', createdAt: toDate(now) }),
      activity(d, { workspaceId: id, caller, targetKind: 'workspace', targetId: id, action: 'workspace.created', at: now }, activityId),
    ],
    [['organization.slug', () => new SlugTaken()]],
  )
  return { id, slug, name: input.name, kind: 'company' as const, role: 'owner' as const }
})

/**
 * The caller's personal workspace and owner membership (docs/08 §1 `ensurePersonalWorkspace`). Idempotent and
 * safe under concurrent calls: both inserts ignore an existing row.
 */
export const ensurePersonalWorkspace = Effect.fn('ensurePersonalWorkspace')(function* (caller: Caller) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const now = yield* nowSeconds
  const userId = caller.userId
  yield* runBatch((d) => [
    d.insert(schema.organization)
      .values({ id: personalWorkspaceId(userId), name: 'Personal', slug: personalSlug(userId), createdAt: toDate(now), kind: 'personal', personalOwnerUserId: userId })
      .onConflictDoNothing(),
    // The personal workspace may predate this scheme (any id); attach the owner to whichever one exists.
    d.insert(schema.member).select(
      d.select({
        id: sql<string>`${personalOwnerMemberId(userId)}`.as('id'),
        organizationId: schema.organization.id,
        userId: sql<string>`${userId}`.as('userId'),
        role: sql<'owner'>`'owner'`.as('role'),
        createdAt: sql<Date>`${now}`.as('createdAt'),
      })
        .from(schema.organization)
        .where(and(
          eq(schema.organization.personalOwnerUserId, userId),
          sql`NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = ${schema.organization.id} AND m.userId = ${userId})`,
        )),
    ),
  ])
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.personalOwnerUserId, userId)).limit(1),
  )
  return found[0]?.id ?? personalWorkspaceId(userId)
})

export interface WorkspaceSummary {
  readonly id: string
  readonly name: string
  readonly kind: 'personal' | 'company'
  readonly role: 'owner' | 'admin' | 'member' | 'commenter' | 'guest'
}

/**
 * Workspaces the caller can select: every internal membership in an unarchived workspace, and guest memberships
 * that still have at least one live grant (docs/08 §1 "Workspace seçimi"). Personal first, then by name.
 */
export const listMyWorkspaces = Effect.fn('listMyWorkspaces')(function* (caller: Caller) {
  const db = yield* Db
  const now = yield* nowSeconds
  const rows = yield* db.use((d) =>
    d
      .select({ id: schema.organization.id, name: schema.organization.name, kind: schema.organization.kind, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .where(and(
        eq(schema.member.userId, caller.userId),
        isNull(schema.organization.archivedAt),
        or(ne(schema.member.role, 'guest'), liveGuestScope(schema.organization.id, schema.member.userId, now)),
      ))
      .orderBy(sql`${schema.organization.kind} = 'company'`, schema.organization.name, schema.organization.id),
  )
  return rows satisfies ReadonlyArray<WorkspaceSummary>
})

/** Whether the caller may select `workspaceId` right now (internal member, or guest with a live grant). */
const canSelect = Effect.fnUntraced(function* (caller: Caller, workspaceId: string) {
  const all = yield* listMyWorkspaces(caller)
  return all.some((w) => w.id === workspaceId)
})

/** Stores the selection on the session after checking access. The workspace is still re-resolved per request. */
export const switchWorkspace = Effect.fn('switchWorkspace')(function* (caller: Caller, headers: Headers, workspaceId: string) {
  if (!(yield* canSelect(caller, workspaceId))) return yield* new WorkspaceUnavailable()
  const auth = yield* Auth
  const result = yield* auth.setActiveWorkspace(headers, workspaceId)
  return { workspaceId, headers: result.headers }
})

/**
 * The workspace a request acts in: the session's selection if the caller can still use it, else the personal
 * workspace (created on first need). A removed membership, archived workspace or expired guest grant falls back.
 */
export const selectWorkspace = Effect.fn('selectWorkspace')(function* (caller: Caller, activeWorkspaceId: string | null) {
  if (activeWorkspaceId !== null && (yield* canSelect(caller, activeWorkspaceId))) return activeWorkspaceId
  return yield* ensurePersonalWorkspace(caller)
})

/**
 * Whether the sign-up onboarding still has to run for this account (D20): the personal workspace exists and was never
 * marked done. Accounts that existed before the cutover were stamped by the backfill; a brand-new sign-up has no stamp.
 */
export const needsOnboarding = Effect.fn('needsOnboarding')(function* (caller: Caller) {
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select({ done: schema.organization.onboardingCompletedAt }).from(schema.organization)
      .where(and(eq(schema.organization.personalOwnerUserId, caller.userId), eq(schema.organization.kind, 'personal'))).limit(1),
  )
  return found[0] !== undefined && found[0].done === null
})

/** Marks onboarding done (finished, skipped, or made pointless by joining through an invitation). Idempotent. */
export const completeOnboarding = Effect.fn('completeOnboarding')(function* (caller: Caller) {
  yield* ensurePersonalWorkspace(caller)
  const now = yield* nowSeconds
  yield* runBatch((d) => [
    d.update(schema.organization).set({ onboardingCompletedAt: toDate(now) })
      .where(and(eq(schema.organization.personalOwnerUserId, caller.userId), isNull(schema.organization.onboardingCompletedAt))),
  ])
  return { completed: true }
})
