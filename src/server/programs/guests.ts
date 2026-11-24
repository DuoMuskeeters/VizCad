import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import type { Locale } from '../emails/auth'
import {
  EmailUnverified,
  GuestLimitReached,
  InvitationExpired,
  InvitationUnavailable,
  RoleConflict,
  WorkspaceUnavailable,
  WriteConflict,
} from '../errors'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { authorizeGrant, checkExpiry, fileContext, memberRole, projectContext } from './access'
import { limitInvites, normalizeEmail, sendInvitation } from './invitationMail'
import { activity, authorize, type Caller, guard, newId, nowSeconds, runBatch, stillRole, toDate, toSeconds } from './shared'

export type GuestLevel = 'view' | 'comment' | 'download'
export type GuestTarget = { readonly fileId: string } | { readonly projectId: string }

/** 32 random bytes, base64url: the secret in the guest invitation link. Only its SHA-256 is stored. */
export const newToken = Effect.sync(() =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** SHA-256 of a fixed-size input cannot fail; a failure would be a defect, not a domain error. */
export const tokenDigest = (token: string) =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).pipe(Effect.map(hex))

/**
 * Decides whether `caller` may give a guest `level` until `accessExpiresAt` on the target (docs/08 §4: file sharing needs
 * `edit` and, in a restricted project, project management). Returns the write-time conditions for the batch.
 */
const guestGrantDecision = Effect.fnUntraced(function* (
  caller: Caller,
  workspaceId: string,
  target: GuestTarget,
  level: GuestLevel,
  accessExpiresAt: number,
) {
  const recipient = { workspaceId, userId: '', role: 'guest' }
  if ('fileId' in target) {
    const { role, base, still } = yield* fileContext(caller, workspaceId, target.fileId)
    yield* authorizeGrant(
      { ...base, action: { kind: 'shareFile' } },
      checkExpiry(workspaceId, 'guest', accessExpiresAt, base.now),
      { ...base, action: { kind: 'grantFileAccess', recipient, level, expiresAt: accessExpiresAt } },
    )
    return { now: base.now, still: sql`${stillRole(workspaceId, caller.userId, [role])} AND ${still}` }
  }
  const { role, base, still } = yield* projectContext(caller, workspaceId, target.projectId)
  yield* authorizeGrant(
    { ...base, action: { kind: 'manageProjectAccess' } },
    checkExpiry(workspaceId, 'guest', accessExpiresAt, base.now),
    { ...base, action: { kind: 'grantProjectAccess', recipient, level, expiresAt: accessExpiresAt } },
  )
  return { now: base.now, still: sql`${stillRole(workspaceId, caller.userId, [role])} AND ${still}` }
})

const targetColumns = (target: GuestTarget) =>
  'fileId' in target ? { fileId: target.fileId, projectId: null } : { fileId: null, projectId: target.projectId }

const sameTarget = (target: GuestTarget) =>
  'fileId' in target ? eq(schema.resourceInvitations.fileId, target.fileId) : eq(schema.resourceInvitations.projectId, target.projectId)

/**
 * Invites an outside address as a guest of one file or project (default `comment`, at most `download`, mandatory access
 * end). The invitation's own acceptance window is separate and always ends before the access does. An internal member
 * cannot be invited as a guest (RoleConflict): give them project/file access instead. Re-inviting the same address to the
 * same target resends from the pending row with a fresh token.
 */
export const inviteGuest = Effect.fn('inviteGuest')(function* (
  caller: Caller,
  input: {
    readonly workspaceId: string
    readonly target: GuestTarget
    readonly email: string
    readonly level: GuestLevel
    readonly accessExpiresAt: number
    readonly locale: Locale
  },
) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const { now, still } = yield* guestGrantDecision(caller, input.workspaceId, input.target, input.level, input.accessExpiresAt)
  const address = normalizeEmail(input.email)
  const db = yield* Db
  const internal = yield* db.use((d) =>
    d.select({ role: schema.member.role }).from(schema.member).innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.organizationId, input.workspaceId), eq(schema.user.email, address))).limit(1),
  )
  if (internal[0] !== undefined && internal[0].role !== 'guest') return yield* new RoleConflict()
  yield* limitInvites(caller, input.workspaceId)

  const limits = yield* (yield* Entitlements).limits(input.workspaceId)
  const expiresAt = Math.min(now + limits.invitationTtlSeconds, input.accessExpiresAt - 1)
  const token = yield* newToken
  const digest = yield* tokenDigest(token)
  const pending = yield* db.use((d) =>
    d.select({ id: schema.resourceInvitations.id }).from(schema.resourceInvitations)
      .where(and(sameTarget(input.target), eq(schema.resourceInvitations.email, address), eq(schema.resourceInvitations.status, 'pending'), gt(schema.resourceInvitations.expiresAt, toDate(now))))
      .limit(1),
  )
  const id = pending[0]?.id ?? (yield* newId)
  const values = { level: input.level, expiresAt: toDate(expiresAt), accessExpiresAt: toDate(input.accessExpiresAt), tokenDigest: digest, inviterId: caller.userId }
  const activityId = yield* newId
  const targetKind = 'fileId' in input.target ? 'file' as const : 'project' as const
  const targetId = 'fileId' in input.target ? input.target.fileId : input.target.projectId
  yield* runBatch(
    (d) => [
      guard(d, still),
      d.update(schema.resourceInvitations).set({ status: 'canceled' })
        .where(and(sameTarget(input.target), eq(schema.resourceInvitations.email, address), eq(schema.resourceInvitations.status, 'pending'), lte(schema.resourceInvitations.expiresAt, toDate(now)))),
      pending[0] === undefined
        ? d.insert(schema.resourceInvitations).values({
          id, workspaceId: input.workspaceId, ...targetColumns(input.target), email: address, status: 'pending', createdAt: toDate(now), ...values,
        })
        : d.update(schema.resourceInvitations).set(values).where(and(eq(schema.resourceInvitations.id, id), eq(schema.resourceInvitations.status, 'pending'))),
      activity(d, { workspaceId: input.workspaceId, caller, targetKind, targetId, action: pending[0] === undefined ? 'guest.invited' : 'guest.invite_resent', at: now }, activityId),
    ],
    [['resource_invitations.', () => new WriteConflict()]],
  )
  yield* sendInvitation({ kind: 'guest', to: address, path: `/guest-invite/${token}`, locale: input.locale, inviterEmail: normalizeEmail(caller.email) })
  return { invitationId: id, email: address, level: input.level, expiresAt, accessExpiresAt: input.accessExpiresAt, resent: pending[0] !== undefined }
})

/**
 * Accepts a guest invitation from its link token (single use: the row moves to `accepted`). Needs a verified session
 * with the invited address and an explicit POST; the inviter's current sharing right and the target's state are
 * re-checked, then guest membership (if new) and the expiring grant are written in one guarded batch.
 */
export const acceptGuestInvitation = Effect.fn('acceptGuestInvitation')(function* (caller: Caller, input: { readonly token: string }) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const digest = yield* tokenDigest(input.token)
  const db = yield* Db
  const read = db.use((d) => d.select().from(schema.resourceInvitations).where(eq(schema.resourceInvitations.tokenDigest, digest)).limit(1)).pipe(Effect.map((r) => r[0]))
  const invitation = yield* read
  if (invitation === undefined || invitation.email !== normalizeEmail(caller.email)) return yield* new InvitationUnavailable()
  const target: GuestTarget = invitation.fileId !== null ? { fileId: invitation.fileId } : { projectId: invitation.projectId ?? '' }
  const done = { workspaceId: invitation.workspaceId, ...targetColumns(target) }
  if (invitation.status === 'accepted' && invitation.acceptedByUserId === caller.userId) return done
  if (invitation.status !== 'pending') return yield* new InvitationUnavailable()
  const now = yield* nowSeconds
  if (now >= toSeconds(invitation.expiresAt)) return yield* new InvitationExpired()
  const workspaceId = invitation.workspaceId
  const live = yield* db.use((d) => d.select({ id: schema.organization.id }).from(schema.organization).where(and(eq(schema.organization.id, workspaceId), isNull(schema.organization.archivedAt))).limit(1))
  if (live[0] === undefined) return yield* new WorkspaceUnavailable()

  const current = yield* memberRole(workspaceId, caller.userId).pipe(Effect.option)
  if (current._tag === 'Some' && current.value !== 'guest') return yield* new RoleConflict()
  // The inviter must still be allowed to share this target at this level and duration.
  const inviter: Caller = { userId: invitation.inviterId, email: '', emailVerified: true, requestId: caller.requestId, ip: null }
  const { still } = yield* guestGrantDecision(inviter, workspaceId, target, invitation.level, toSeconds(invitation.accessExpiresAt)).pipe(
    Effect.catchTags({
      PermissionDenied: () => Effect.fail(new InvitationUnavailable()),
      ResourceUnavailable: () => Effect.fail(new InvitationUnavailable()),
      WorkspaceUnavailable: () => Effect.fail(new InvitationUnavailable()),
      LastOwner: () => Effect.fail(new InvitationUnavailable()),
      InvalidAccessLevel: () => Effect.fail(new InvitationUnavailable()),
      AccessExpiryInvalid: () => Effect.fail(new InvitationUnavailable()),
    }),
  )
  const limits = yield* (yield* Entitlements).limits(workspaceId)
  const guestCount = sql`(SELECT count(*) FROM member WHERE organizationId = ${workspaceId} AND role = 'guest')`
  if (current._tag === 'None' && limits.guests !== null) {
    const row = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${guestCount} AS n`))
    if ((row?.n ?? 0) >= limits.guests) return yield* new GuestLimitReached()
  }
  const conditions = [
    sql`EXISTS (SELECT 1 FROM resource_invitations WHERE id = ${invitation.id} AND status = 'pending' AND expiresAt > ${now})`,
    still,
    current._tag === 'Some'
      ? stillRole(workspaceId, caller.userId, ['guest'])
      : sql`NOT EXISTS (SELECT 1 FROM member WHERE organizationId = ${workspaceId} AND userId = ${caller.userId})`,
    ...(current._tag === 'None' && limits.guests !== null ? [sql`${guestCount} < ${limits.guests}`] : []),
  ]
  const at = toDate(now)
  const accessExpiresAt = invitation.accessExpiresAt
  const memberId = yield* newId
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql.join(conditions, sql` AND `)),
    d.update(schema.resourceInvitations).set({ status: 'accepted', acceptedByUserId: caller.userId }).where(eq(schema.resourceInvitations.id, invitation.id)),
    d.insert(schema.member).values({ id: memberId, organizationId: workspaceId, userId: caller.userId, role: 'guest', createdAt: at }).onConflictDoNothing(),
    'fileId' in target
      ? d.insert(schema.fileAccess)
        .values({ workspaceId, fileId: target.fileId, userId: caller.userId, level: invitation.level, expiresAt: accessExpiresAt, grantedByUserId: invitation.inviterId, source: 'grant', createdAt: at, updatedAt: at })
        .onConflictDoUpdate({
          target: [schema.fileAccess.fileId, schema.fileAccess.userId],
          set: { level: invitation.level, expiresAt: accessExpiresAt, grantedByUserId: invitation.inviterId, updatedAt: at },
          setWhere: eq(schema.fileAccess.source, 'grant'),
        })
      : d.insert(schema.projectAccess)
        .values({ workspaceId, projectId: target.projectId, userId: caller.userId, level: invitation.level, expiresAt: accessExpiresAt, grantedByUserId: invitation.inviterId, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({
          target: [schema.projectAccess.projectId, schema.projectAccess.userId],
          set: { level: invitation.level, expiresAt: accessExpiresAt, grantedByUserId: invitation.inviterId, updatedAt: at },
        }),
    activity(d, { workspaceId, caller, targetKind: 'guest_invitation', targetId: invitation.id, action: 'guest.joined', at: now }, activityId),
  ]).pipe(
    Effect.catchTag('WriteConflict', (conflict) =>
      read.pipe(Effect.flatMap((again) => again?.status === 'accepted' && again.acceptedByUserId === caller.userId ? Effect.void : Effect.fail(conflict)))),
  )
  return done
})

/**
 * Cancels a pending guest invitation. Allowed to whoever may revoke a guest grant on that target: owner/admin, the
 * restricted project's manager, or the member who sent it (docs/08 §4.4).
 */
export const revokeGuestInvitation = Effect.fn('revokeGuestInvitation')(function* (caller: Caller, input: { readonly workspaceId: string; readonly invitationId: string }) {
  const db = yield* Db
  const found = yield* db.use((d) =>
    d.select().from(schema.resourceInvitations)
      .where(and(eq(schema.resourceInvitations.id, input.invitationId), eq(schema.resourceInvitations.workspaceId, input.workspaceId))).limit(1),
  )
  const invitation = found[0]
  if (invitation === undefined) return yield* new InvitationUnavailable()
  const target = { workspaceId: input.workspaceId, role: 'guest', grantedByUserId: invitation.inviterId }
  const { role, now } = invitation.fileId !== null
    ? yield* fileContext(caller, input.workspaceId, invitation.fileId).pipe(Effect.tap(({ base }) =>
      authorize({ ...base, action: { kind: 'revokeFileAccess', target: { ...target, resourceId: invitation.fileId ?? '' } } })), Effect.map(({ role, base }) => ({ role, now: base.now })))
    : yield* projectContext(caller, input.workspaceId, invitation.projectId ?? '').pipe(Effect.tap(({ base }) =>
      authorize({ ...base, action: { kind: 'revokeProjectAccess', target: { ...target, resourceId: invitation.projectId ?? '' } } })), Effect.map(({ role, base }) => ({ role, now: base.now })))
  if (invitation.status === 'canceled') return { canceled: true }
  if (invitation.status !== 'pending') return yield* new InvitationUnavailable()
  const activityId = yield* newId
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND EXISTS (SELECT 1 FROM resource_invitations WHERE id = ${invitation.id} AND status = 'pending')`),
    d.update(schema.resourceInvitations).set({ status: 'canceled' }).where(and(eq(schema.resourceInvitations.id, invitation.id), eq(schema.resourceInvitations.status, 'pending'))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'guest_invitation', targetId: invitation.id, action: 'guest.invite_canceled', at: now }, activityId),
  ])
  return { canceled: true }
})
