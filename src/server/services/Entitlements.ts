import { eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'
import * as schema from '../db/schema'
import type { DbError } from '../errors'
import { Db } from './Db'

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
  /** Invitations (member and guest) one user may send per day across all workspaces. */
  readonly invitesPerUserPerDay: number
  /** Company workspaces one user may own at the same time. */
  readonly ownedWorkspaces: number
  /** Company workspaces one user may create per day. */
  readonly workspaceCreatesPerDay: number
  /** Largest single file (and file version) in bytes. */
  readonly maxFileBytes: number
  /** Storage in bytes: files and versions (shared keys counted once) plus open upload reservations. Trash counts until purged. */
  readonly storageBytes: number
  /** Days a file stays in the trash before the daily job purges it. */
  readonly trashRetentionDays: number
  /** Active share links; `null` for no limit. */
  readonly activeShareLinks: number | null
  /** Longest link lifetime in seconds; `null` allows links that never expire. */
  readonly linkMaxLifetimeSeconds: number | null
  /** Days `access_log` rows are kept. */
  readonly auditRetentionDays: number
  /** Open (pending) upload sessions one user may hold at once. */
  readonly uploadSessionsPerUser: number
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
    /** Limits that apply to a user's own actions before any workspace exists (creating one, per-user quotas). */
    readonly userLimits: (userId: string) => Effect.Effect<WorkspaceLimits, DbError>
  }
>()('vizcad/Entitlements') {}

const DAY = 24 * 60 * 60
const MB = 1024 * 1024
const GB = 1024 * MB

/** The only plan until billing lands. The single place these numbers live. */
export const defaultPlan: WorkspaceLimits = {
  seats: 25,
  guests: 100,
  projects: 200,
  restrictedProjects: true,
  guestAccessMaxSeconds: 365 * DAY,
  invitationTtlSeconds: 7 * DAY,
  invitesPerDay: 50,
  invitesPerUserPerDay: 100,
  ownedWorkspaces: 5,
  workspaceCreatesPerDay: 10,
  // D21 (24 Kasım 2026), docs/09 §2.3. Sizes are binary (1 GB = 1024 MB), matching the legacy `user.storageQuotaGb`.
  maxFileBytes: 100 * MB,
  storageBytes: 5 * GB,
  trashRetentionDays: 30,
  activeShareLinks: null,
  linkMaxLifetimeSeconds: null,
  auditRetentionDays: 365,
  uploadSessionsPerUser: 20,
}

/** Every workspace gets `limits`. Tests override single fields with `fixed({ ...defaultPlan, seats: 2 })`. */
export const fixed = (limits: WorkspaceLimits) =>
  Layer.succeed(Entitlements, Entitlements.of({ limits: () => Effect.succeed(limits), userLimits: () => Effect.succeed(limits) }))

/**
 * Every workspace is on `defaultPlan`, except that a personal workspace keeps the legacy per-user quota when it is larger
 * (`max(plan, owner's storageQuotaGb)`), so quotas raised by hand under the old app survive (docs/09 §2.3).
 */
export const live = Layer.effect(
  Entitlements,
  Effect.gen(function* () {
    const db = yield* Db
    return Entitlements.of({
      limits: (workspaceId) =>
        db
          .use((d) =>
            d
              .select({ quotaGb: schema.user.storageQuotaGb })
              .from(schema.organization)
              .innerJoin(schema.user, eq(schema.user.id, schema.organization.personalOwnerUserId))
              .where(eq(schema.organization.id, workspaceId))
              .limit(1),
          )
          .pipe(
            Effect.map(([owner]) => ({
              ...defaultPlan,
              storageBytes: Math.max(defaultPlan.storageBytes, (owner?.quotaGb ?? 0) * GB),
            })),
          ),
      userLimits: () => Effect.succeed(defaultPlan),
    })
  }),
)
