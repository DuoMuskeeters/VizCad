import { Context, Effect, Layer } from 'effect'
import type { DbError } from '../errors'

/**
 * What a workspace's plan allows. Programs read limits only from here, never from constants of their own
 * (CLAUDE.md "Commercial"). `null` means no limit.
 */
export interface WorkspaceLimits {
  /** Internal members (owner, admin, member, commenter). Guests never consume a seat (D17). */
  readonly seats: number | null
  /** Guest memberships in the workspace. */
  readonly guests: number | null
  /** Projects that are not archived. */
  readonly projects: number | null
  /** Whether "invited only" (restricted) projects are available. */
  readonly restrictedProjects: boolean
  /** Longest access a guest may get, from now, in seconds. */
  readonly guestAccessMaxSeconds: number
  /** How long an invitation can be accepted, in seconds. */
  readonly invitationTtlSeconds: number
  /** Invitations (member and guest) a workspace may send per day. */
  readonly invitesPerDay: number
}

/**
 * Plan limits per workspace (seats, guests, projects, invitation quotas; later storage and file size). Billing (Faz 8)
 * will choose the plan; until then every workspace is on `defaultPlan`.
 * Live layer: `live` (default plan). Test layer: `fixed(limits)`.
 */
export class Entitlements extends Context.Service<
  Entitlements,
  {
    readonly limits: (workspaceId: string) => Effect.Effect<WorkspaceLimits, DbError>
  }
>()('vizcad/Entitlements') {}

const DAY = 24 * 60 * 60

/** The only plan until billing lands. The single place these numbers live. */
export const defaultPlan: WorkspaceLimits = {
  seats: 25,
  guests: 100,
  projects: 200,
  restrictedProjects: true,
  guestAccessMaxSeconds: 365 * DAY,
  invitationTtlSeconds: 7 * DAY,
  invitesPerDay: 50,
}

/** Every workspace gets `limits`. Tests override single fields with `fixed({ ...defaultPlan, seats: 2 })`. */
export const fixed = (limits: WorkspaceLimits) =>
  Layer.succeed(Entitlements, Entitlements.of({ limits: () => Effect.succeed(limits) }))

export const live = fixed(defaultPlan)
