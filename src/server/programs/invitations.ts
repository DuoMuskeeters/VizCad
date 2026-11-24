import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { EmailUnverified } from '../errors'
import { Db } from '../services/Db'
import { normalizeEmail } from './invitationMail'
import { tokenDigest } from './guests'
import { type Caller, nowSeconds, toSeconds } from './shared'

/** `member`: by invitation id (the `/invite/<id>` link). `guest`: by link token (`/guest-invite/<token>`). */
export type InvitationRef = { readonly kind: 'member'; readonly invitationId: string } | { readonly kind: 'guest'; readonly token: string }

export type InvitationState = 'pending' | 'expired' | 'canceled' | 'accepted'

/** The invitation card shown before accepting. Only plain facts: no free text from the inviter, no resource names. */
export interface InvitationDetails {
  readonly state: InvitationState
  readonly kind: 'member' | 'guest'
  readonly workspaceName: string
  /** The inviter's verified address, or null when it is not verified. */
  readonly inviterEmail: string | null
  /** Member invitations: the workspace role handed out. */
  readonly role: string | null
  /** Guest invitations: the access level and what it covers. */
  readonly level: string | null
  readonly target: 'file' | 'project' | null
  /** Unix seconds: when the invitation can no longer be accepted. */
  readonly expiresAt: number
  /** Guest invitations: when the access ends. */
  readonly accessExpiresAt: number | null
  /** Whether the signed-in account is the invited address (accepting needs it). */
  readonly emailMatches: boolean
}

/** Everything that must not tell the caller anything: unknown id, other address, closed workspace. One shape for all. */
export interface OtherAccount {
  readonly state: 'other_account'
}

const OTHER: OtherAccount = { state: 'other_account' }

const stateOf = (status: string, expiresAt: number, now: number): InvitationState =>
  status === 'accepted' ? 'accepted' : status === 'pending' ? (now >= expiresAt ? 'expired' : 'pending') : 'canceled'

/**
 * Reads an invitation for its accept page. A verified session is required (like accepting). The details go to the
 * account whose address matches the invitation. Anyone else gets `other_account` and nothing else: not the workspace
 * name, not the inviter, and the same answer for an id or token that does not exist. The one exception is a guest
 * invitation that is still open: its token is a secret only the recipient holds, so its holder sees the card (with
 * `emailMatches: false`, so the page offers to switch accounts).
 */
export const getInvitation = Effect.fn('getInvitation')(function* (caller: Caller, input: InvitationRef) {
  if (!caller.emailVerified) return yield* new EmailUnverified()
  const db = yield* Db
  const now = yield* nowSeconds
  const mine = normalizeEmail(caller.email)
  const inviterOf = (inviterId: string) =>
    db.use((d) => d.select({ email: schema.user.email, verified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, inviterId)).limit(1))
  const workspaceOf = (id: string) =>
    db.use((d) => d.select({ name: schema.organization.name, archivedAt: schema.organization.archivedAt }).from(schema.organization).where(eq(schema.organization.id, id)).limit(1))

  if (input.kind === 'member') {
    const found = yield* db.use((d) => d.select().from(schema.invitation).where(eq(schema.invitation.id, input.invitationId)).limit(1))
    const row = found[0]
    if (row === undefined || row.email !== mine) return OTHER
    const [workspace] = yield* workspaceOf(row.organizationId)
    if (workspace === undefined) return OTHER
    const [inviter] = yield* inviterOf(row.inviterId)
    const expiresAt = toSeconds(row.expiresAt)
    return {
      state: workspace.archivedAt === null ? stateOf(row.status, expiresAt, now) : 'canceled',
      kind: 'member', workspaceName: workspace.name, inviterEmail: inviter?.verified ? inviter.email : null,
      role: row.role, level: null, target: null, expiresAt, accessExpiresAt: null, emailMatches: true,
    } satisfies InvitationDetails
  }

  const digest = yield* tokenDigest(input.token)
  const found = yield* db.use((d) => d.select().from(schema.resourceInvitations).where(eq(schema.resourceInvitations.tokenDigest, digest)).limit(1))
  const row = found[0]
  if (row === undefined) return OTHER
  const emailMatches = row.email === mine
  const expiresAt = toSeconds(row.expiresAt)
  const state = stateOf(row.status, expiresAt, now)
  if (!emailMatches && state !== 'pending') return OTHER
  const [workspace] = yield* workspaceOf(row.workspaceId)
  if (workspace === undefined) return OTHER
  const [inviter] = yield* inviterOf(row.inviterId)
  return {
    state: workspace.archivedAt === null ? state : 'canceled',
    kind: 'guest', workspaceName: workspace.name, inviterEmail: inviter?.verified ? inviter.email : null,
    role: null, level: row.level, target: row.fileId !== null ? 'file' : 'project', expiresAt,
    accessExpiresAt: toSeconds(row.accessExpiresAt), emailMatches,
  } satisfies InvitationDetails
})
