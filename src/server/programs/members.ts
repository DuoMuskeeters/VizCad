import { and, asc, eq, gt, isNull, lte, type SQL, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import type { Locale } from '../emails/auth'
import {
  EmailUnverified,
  InvitationConflict,
  InvitationExpired,
  InvitationUnavailable,
  SeatLimitReached,
  WorkspaceUnavailable,
  WriteConflict,
} from '../errors'
import { decidePermission } from '../permissions'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { memberRole } from './access'
import { limitInvites, normalizeEmail, sendInvitation } from './invitationMail'
import {
  activity,
  authorize,
  type Caller,
  guard,
  newId,
  nowSeconds,
  permissionActor,
  requireMembership,
  runBatch,
  stillRole,
  toDate,
  toSeconds,
} from './shared'

type InternalRole = 'admin' | 'member' | 'commenter'

/** SQL: the workspace still has a free seat. `pendingExcept` leaves one address's pending invitation out of the count. */
const seatFree = (workspaceId: string, seats: number, now: number, pendingExcept: string | null): SQL =>
  sql`((SELECT count(*) FROM member WHERE organizationId = ${workspaceId} AND role IN ('owner','admin','member','commenter'))
    + (SELECT count(*) FROM invitation WHERE organizationId = ${workspaceId} AND status = 'pending' AND expiresAt > ${now}
       AND (${pendingExcept} IS NULL OR email <> ${pendingExcept}))) < ${seats}`

/** Same rule as `seatFree`, read before the batch for a clear error; the batch re-checks it. */
const seatsUsed = Effect.fnUntraced(function* (workspaceId: string, now: number, pendingExcept: string | null) {
  const db = yield* Db
  const row = yield* db.use((d) =>
    d.get<{ used: number }>(sql`SELECT (SELECT count(*) FROM member WHERE organizationId = ${workspaceId} AND role IN ('owner','admin','member','commenter'))
      + (SELECT count(*) FROM invitation WHERE organizationId = ${workspaceId} AND status = 'pending' AND expiresAt > ${now}
         AND (${pendingExcept} IS NULL OR email <> ${pendingExcept})) AS used`),
  )
  return row?.used ?? 0
})

/** The member row (and role) of the account with this address, if any. */
const membershipByEmail = Effect.fnUntraced(function* (workspaceId: string, address: string) {
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select({ userId: schema.member.userId, role: schema.member.role }).from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.organizationId, workspaceId), eq(schema.user.email, address))).limit(1),
  )
  return found[0]
})

/**
 * Invites an address into a company workspace with one internal role. Re-inviting the same address while an invitation
 * is pending resends from that row (fresh expiry, new role); an expired pending row is closed in the same batch.
 */
export const inviteMember = Effect.fn('inviteMember')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly email: string; readonly role: InternalRole; readonly locale: Locale },
) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const { workspace, role } = yield* requireMembership(input.workspaceId, caller.userId)
  const now = yield* nowSeconds
  yield* authorize({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'inviteMember', role: input.role } })
  const address = normalizeEmail(input.email)
  const existing = yield* membershipByEmail(workspace.id, address)
  if (existing !== undefined && existing.role !== 'guest') return yield* new InvitationConflict()
  const limits = yield* (yield* Entitlements).limits(workspace.id)
  if (limits.seats !== null && (yield* seatsUsed(workspace.id, now, address)) >= limits.seats) return yield* new SeatLimitReached()
  yield* limitInvites(caller, workspace.id)

  const db = yield* Db
  const pending = yield* db.use((d) =>
    d.select({ id: schema.invitation.id }).from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, workspace.id), eq(schema.invitation.email, address), eq(schema.invitation.status, 'pending'), gt(schema.invitation.expiresAt, toDate(now))))
      .limit(1),
  )
  const id = pending[0]?.id ?? (yield* newId)
  const expiresAt = now + limits.invitationTtlSeconds
  const activityId = yield* newId
  const conditions = [
    stillRole(workspace.id, caller.userId, [role]),
    // A resend needs its pending row to still be pending (a concurrent revoke must not be silently undone).
    ...(pending[0] === undefined ? [] : [sql`EXISTS (SELECT 1 FROM invitation WHERE id = ${id} AND status = 'pending')`]),
    ...(limits.seats === null ? [] : [seatFree(workspace.id, limits.seats, now, address)]),
  ]
  yield* runBatch(
    (d) => [
      guard(d, sql.join(conditions, sql` AND `)),
      d.update(schema.invitation).set({ status: 'canceled' })
        .where(and(eq(schema.invitation.organizationId, workspace.id), eq(schema.invitation.email, address), eq(schema.invitation.status, 'pending'), lte(schema.invitation.expiresAt, toDate(now)))),
      pending[0] === undefined
        ? d.insert(schema.invitation).values({
          id, organizationId: workspace.id, email: address, role: input.role, status: 'pending',
          expiresAt: toDate(expiresAt), createdAt: toDate(now), inviterId: caller.userId,
        })
        : d.update(schema.invitation).set({ role: input.role, expiresAt: toDate(expiresAt), inviterId: caller.userId })
          .where(and(eq(schema.invitation.id, id), eq(schema.invitation.status, 'pending'))),
      activity(d, { workspaceId: workspace.id, caller, targetKind: 'invitation', targetId: id, action: pending[0] === undefined ? 'member.invited' : 'member.invite_resent', at: now }, activityId),
    ],
    [['invitation.organizationId, invitation.email', () => new WriteConflict()]],
  )
  yield* sendInvitation({ kind: 'member', to: address, path: `/invite/${id}`, locale: input.locale, inviterEmail: normalizeEmail(caller.email) })
  return { invitationId: id, email: address, role: input.role, expiresAt, resent: pending[0] !== undefined }
})

/**
 * Accepts a member invitation by id. Only a verified session with the invited address may accept; the inviter's current
 * right, the seat count, the caller's membership and the invitation state are checked again inside the batch. A guest
 * of the workspace is upgraded in place (their grants stay). Accepting twice returns the same result.
 */
export const acceptInvitation = Effect.fn('acceptInvitation')(function* (caller: Caller, input: { readonly invitationId: string }) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const db = yield* Db
  const read = db.use((d) => d.select().from(schema.invitation).where(eq(schema.invitation.id, input.invitationId)).limit(1)).pipe(Effect.map((r) => r[0]))
  const invitation = yield* read
  if (invitation === undefined || invitation.email !== normalizeEmail(caller.email)) return yield* new InvitationUnavailable()
  const done = { workspaceId: invitation.organizationId, role: invitation.role }
  if (invitation.status === 'accepted' && invitation.acceptedByUserId === caller.userId) return done
  if (invitation.status !== 'pending') return yield* new InvitationUnavailable()
  const now = yield* nowSeconds
  if (now >= toSeconds(invitation.expiresAt)) return yield* new InvitationExpired()

  const workspaceId = invitation.organizationId
  const workspaces = yield* db.use((d) => d.select().from(schema.organization).where(and(eq(schema.organization.id, workspaceId), isNull(schema.organization.archivedAt))).limit(1))
  const ws = workspaces[0]
  if (ws === undefined) return yield* new WorkspaceUnavailable()
  const workspace = { id: ws.id, kind: ws.kind, archived: false }

  // The inviter must still be allowed to hand out this role.
  const inviterRole = yield* memberRole(workspaceId, invitation.inviterId).pipe(Effect.mapError(() => new InvitationUnavailable()))
  const inviter = { kind: 'member', userId: invitation.inviterId, workspaceId, role: inviterRole, emailVerified: true } as const
  if (!decidePermission({ actor: inviter, workspace, now, action: { kind: 'inviteMember', role: invitation.role } }).allowed) {
    return yield* new InvitationUnavailable()
  }

  const current = yield* memberRole(workspaceId, caller.userId).pipe(Effect.option)
  if (current._tag === 'Some' && current.value !== 'guest') return yield* new InvitationConflict()
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  // The invitation itself is pending, so it is already counted: leave its address out.
  if (limits.seats !== null && (yield* seatsUsed(workspaceId, now, invitation.email)) >= limits.seats) return yield* new SeatLimitReached()

  const membershipState = current._tag === 'Some'
    ? stillRole(workspaceId, caller.userId, ['guest'])
    : sql`NOT EXISTS (SELECT 1 FROM member WHERE organizationId = ${workspaceId} AND userId = ${caller.userId})`
  const conditions = [
    sql`EXISTS (SELECT 1 FROM invitation WHERE id = ${invitation.id} AND status = 'pending' AND expiresAt > ${now})`,
    stillRole(workspaceId, invitation.inviterId, [inviterRole]),
    membershipState,
    ...(limits.seats === null ? [] : [seatFree(workspaceId, limits.seats, now, invitation.email)]),
  ]
  const memberId = yield* newId
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql.join(conditions, sql` AND `)),
    d.update(schema.invitation).set({ status: 'accepted', acceptedByUserId: caller.userId }).where(eq(schema.invitation.id, invitation.id)),
    current._tag === 'Some'
      ? d.update(schema.member).set({ role: invitation.role })
        .where(and(eq(schema.member.organizationId, workspaceId), eq(schema.member.userId, caller.userId), eq(schema.member.role, 'guest')))
      : d.insert(schema.member).values({ id: memberId, organizationId: workspaceId, userId: caller.userId, role: invitation.role, createdAt: toDate(now) }),
    activity(d, { workspaceId, caller, targetKind: 'member', targetId: caller.userId, action: 'member.joined', at: now }, activityId),
  ]).pipe(
    // A concurrent accept by the same account already did the work: same answer.
    Effect.catchTag('WriteConflict', (conflict) =>
      read.pipe(Effect.flatMap((again) => again?.status === 'accepted' && again.acceptedByUserId === caller.userId ? Effect.void : Effect.fail(conflict)))),
  )
  return done
})

/** Cancels a pending member invitation of this workspace. Another workspace's invitation is simply unavailable. */
export const revokeInvitation = Effect.fn('revokeInvitation')(function* (caller: Caller, input: { readonly workspaceId: string; readonly invitationId: string }) {
  const { workspace, role } = yield* requireMembership(input.workspaceId, caller.userId)
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select().from(schema.invitation).where(and(eq(schema.invitation.id, input.invitationId), eq(schema.invitation.organizationId, workspace.id))).limit(1),
  )
  const invitation = found[0]
  if (invitation === undefined) return yield* new InvitationUnavailable()
  const now = yield* nowSeconds
  yield* authorize({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'inviteMember', role: invitation.role } })
  if (invitation.status === 'canceled') return { canceled: true }
  if (invitation.status !== 'pending') return yield* new InvitationUnavailable()
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(workspace.id, caller.userId, [role])} AND EXISTS (SELECT 1 FROM invitation WHERE id = ${invitation.id} AND status = 'pending')`),
    d.update(schema.invitation).set({ status: 'canceled' }).where(and(eq(schema.invitation.id, invitation.id), eq(schema.invitation.status, 'pending'))),
    activity(d, { workspaceId: workspace.id, caller, targetKind: 'invitation', targetId: invitation.id, action: 'member.invite_canceled', at: now }, activityId),
  ])
  return { canceled: true }
})

/** Shared start of the member-management programs: caller, target and the decision from permissions.ts. */
const memberTarget = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, userId: string) {
  const { workspace, role } = yield* requireMembership(workspaceId, caller.userId)
  const now = yield* nowSeconds
  const actor = permissionActor(caller, workspace.id, role)
  // The actor's right comes first: someone who may not manage members learns nothing about who exists.
  yield* authorize({ actor, workspace, now, action: { kind: 'manageMembers' } })
  const targetRole = yield* memberRole(workspaceId, userId)
  return { workspace, role, targetRole, now, actor, target: { workspaceId, userId, role: targetRole } }
})

/**
 * Changes an internal role, or promotes a guest to member/commenter (their grants stay). A guest promotion takes a seat.
 * Demoting a project's creator to commenter ends their creator-manager status.
 */
export const changeRole = Effect.fn('changeRole')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly userId: string; readonly role: InternalRole },
) {
  const { workspace, role, targetRole, now, actor, target } = yield* memberTarget(caller, input.workspaceId, input.userId)
  yield* authorize({ actor, workspace, now, action: { kind: 'changeRole', target, role: input.role } })
  if (targetRole === input.role) return { userId: input.userId, role: input.role }
  const limits = yield* (yield* Entitlements).limits(workspace.id)
  const takesSeat = targetRole === 'guest' && limits.seats !== null
  if (takesSeat && limits.seats !== null && (yield* seatsUsed(workspace.id, now, null)) >= limits.seats) return yield* new SeatLimitReached()
  const conditions = [
    stillRole(workspace.id, caller.userId, [role]),
    stillRole(workspace.id, input.userId, [targetRole]),
    ...(takesSeat && limits.seats !== null ? [seatFree(workspace.id, limits.seats, now, null)] : []),
  ]
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql.join(conditions, sql` AND `)),
    ...(input.role === 'commenter'
      ? [d.update(schema.projects).set({ creatorManagerUserId: null })
        .where(and(eq(schema.projects.workspaceId, workspace.id), eq(schema.projects.creatorManagerUserId, input.userId)))]
      : []),
    d.update(schema.member).set({ role: input.role })
      .where(and(eq(schema.member.organizationId, workspace.id), eq(schema.member.userId, input.userId), eq(schema.member.role, targetRole))),
    activity(d, { workspaceId: workspace.id, caller, targetKind: 'member', targetId: input.userId, action: 'member.role_changed', at: now }, activityId),
  ])
  return { userId: input.userId, role: input.role }
})

/**
 * Removes a member or guest (docs/08 §4.5): their live links are revoked, their pending invitations closed, the
 * creator-manager mark cleared, sessions pointing at the workspace reset, and their grants go with the membership
 * (cascade). Rejoining later starts from nothing.
 */
export const removeMember = Effect.fn('removeMember')(function* (caller: Caller, input: { readonly workspaceId: string; readonly userId: string }) {
  const { workspace, role, targetRole, now, actor, target } = yield* memberTarget(caller, input.workspaceId, input.userId)
  yield* authorize({ actor, workspace, now, action: { kind: 'removeMember', target } })
  const at = toDate(now)
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(workspace.id, caller.userId, [role])} AND ${stillRole(workspace.id, input.userId, [targetRole])}`),
    d.update(schema.projects).set({ creatorManagerUserId: null })
      .where(and(eq(schema.projects.workspaceId, workspace.id), eq(schema.projects.creatorManagerUserId, input.userId))),
    d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
      .where(and(eq(schema.shareLinks.workspaceId, workspace.id), eq(schema.shareLinks.createdByUserId, input.userId), isNull(schema.shareLinks.revokedAt))),
    d.update(schema.invitation).set({ status: 'canceled' })
      .where(and(eq(schema.invitation.organizationId, workspace.id), eq(schema.invitation.inviterId, input.userId), eq(schema.invitation.status, 'pending'))),
    d.update(schema.resourceInvitations).set({ status: 'canceled' })
      .where(and(eq(schema.resourceInvitations.workspaceId, workspace.id), eq(schema.resourceInvitations.inviterId, input.userId), eq(schema.resourceInvitations.status, 'pending'))),
    d.update(schema.session).set({ activeOrganizationId: null })
      .where(and(eq(schema.session.userId, input.userId), eq(schema.session.activeOrganizationId, workspace.id))),
    d.delete(schema.member).where(and(eq(schema.member.organizationId, workspace.id), eq(schema.member.userId, input.userId))),
    activity(d, { workspaceId: workspace.id, caller, targetKind: 'member', targetId: input.userId, action: 'member.removed', at: now }, activityId),
  ])
  return { removed: true }
})

/**
 * Hands a company workspace to an existing admin or member. One guarded batch demotes the owner to admin and promotes
 * the target; if either write does not happen the closing guard rolls everything back, so exactly one owner remains.
 */
export const transferOwnership = Effect.fn('transferOwnership')(function* (caller: Caller, input: { readonly workspaceId: string; readonly userId: string }) {
  const { workspace, targetRole, now, actor, target } = yield* memberTarget(caller, input.workspaceId, input.userId)
  yield* authorize({ actor, workspace, now, action: { kind: 'transferOwnership', target } })
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(workspace.id, caller.userId, ['owner'])} AND ${stillRole(workspace.id, input.userId, [targetRole])}`),
    d.update(schema.member).set({ role: 'admin' })
      .where(and(eq(schema.member.organizationId, workspace.id), eq(schema.member.userId, caller.userId), eq(schema.member.role, 'owner'))),
    d.update(schema.member).set({ role: 'owner' })
      .where(and(eq(schema.member.organizationId, workspace.id), eq(schema.member.userId, input.userId), eq(schema.member.role, targetRole))),
    guard(d, sql`${stillRole(workspace.id, input.userId, ['owner'])} AND ${stillRole(workspace.id, caller.userId, ['admin'])}`),
    activity(d, { workspaceId: workspace.id, caller, targetKind: 'member', targetId: input.userId, action: 'workspace.ownership_transferred', at: now }, activityId),
  ])
  return { ownerUserId: input.userId }
})

export interface MemberView {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: string
  readonly joinedAt: number
}

/**
 * The workspace's people. Internal members (owner, admin, member, commenter) see everyone, guests included (name and
 * address); owners and admins also get pending invitations. A guest, even one whose grants have all expired, sees only
 * their own row (D19). The rule is `viewTeam` in permissions.ts.
 */
export const listMembers = Effect.fn('listMembers')(function* (caller: Caller, input: { readonly workspaceId: string }) {
  const { workspace, role } = yield* requireMembership(input.workspaceId, caller.userId)
  const db = yield* Db
  const now = yield* nowSeconds
  const team = decidePermission({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'viewTeam' } }).allowed
  const rows = yield* db.use((d) =>
    d.select({ userId: schema.member.userId, name: schema.user.name, email: schema.user.email, role: schema.member.role, joinedAt: schema.member.createdAt })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(
        eq(schema.member.organizationId, workspace.id),
        team ? undefined : eq(schema.member.userId, caller.userId),
      ))
      .orderBy(asc(schema.member.createdAt), asc(schema.member.userId)),
  )
  const members: ReadonlyArray<MemberView> = rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    role: r.role,
    joinedAt: toSeconds(r.joinedAt),
    email: r.email,
  }))
  const manages = decidePermission({ actor: permissionActor(caller, workspace.id, role), workspace, now, action: { kind: 'manageMembers' } }).allowed
  if (!manages) return { members, invitations: [] }
  const invitations = yield* db.use((d) =>
    d.select({ id: schema.invitation.id, email: schema.invitation.email, role: schema.invitation.role, expiresAt: schema.invitation.expiresAt })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, workspace.id), eq(schema.invitation.status, 'pending'), gt(schema.invitation.expiresAt, toDate(now))))
      .orderBy(asc(schema.invitation.createdAt)),
  )
  return { members, invitations: invitations.map((i) => ({ ...i, expiresAt: toSeconds(i.expiresAt) })) }
})
