import { Layer } from 'effect'
import * as schema from '../db/schema'
import type { Caller } from '../programs/shared'
import * as AppConfig from '../services/AppConfig'
import * as Auth from '../services/Auth'
import * as Background from '../services/Background'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import * as Email from '../services/Email'
import * as Entitlements from '../services/Entitlements'
import * as RateLimit from '../services/RateLimit'
import * as Storage from '../services/Storage'

/** Fixed test clock start: 2026-11-24T10:00:00Z. Tests move it with TestClock.adjust. */
export const T0 = 1795514400

/** Every layer a product program may need, all in memory (node only). */
export const programLayer = (limits: Entitlements.WorkspaceLimits = Entitlements.defaultPlan) =>
  Layer.mergeAll(
    DbMemory.memory,
    Auth.memory,
    Email.memory,
    RateLimit.memory,
    Entitlements.fixed(limits),
    Background.inline,
    Storage.memory,
  ).pipe(Layer.provideMerge(AppConfig.test()))

const at = (seconds: number) => new Date(seconds * 1000)

export const caller = (userId: string, overrides: Partial<Caller> = {}): Caller => ({
  userId,
  email: `${userId}@example.com`,
  emailVerified: true,
  requestId: 'ray-test',
  ip: '203.0.113.7',
  ...overrides,
})

export const seedUser = (id: string, options: { emailVerified?: boolean } = {}) =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.user).values({
        id,
        name: id.toUpperCase(),
        email: `${id}@example.com`,
        emailVerified: options.emailVerified ?? true,
        createdAt: at(T0 - 86400),
        updatedAt: at(T0 - 86400),
      }),
    ),
  )

export const seedWorkspace = (id: string, ownerId: string, kind: 'company' | 'personal' = 'company') =>
  Db.use((db) =>
    db.use((d) =>
      d.batch([
        d.insert(schema.organization).values({
          id, name: `Workspace ${id}`, slug: `slug-${id}`, createdAt: at(T0 - 3600), kind,
          personalOwnerUserId: kind === 'personal' ? ownerId : null,
        }),
        d.insert(schema.member).values({ id: `m-${id}-${ownerId}`, organizationId: id, userId: ownerId, role: 'owner', createdAt: at(T0 - 3600) }),
      ]),
    ),
  )

export const seedMember = (workspaceId: string, userId: string, role: 'admin' | 'member' | 'commenter' | 'guest') =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.member).values({ id: `m-${workspaceId}-${userId}`, organizationId: workspaceId, userId, role, createdAt: at(T0 - 3600) }),
    ),
  )

export const seedFile = (id: string, ownerId: string, workspaceId: string | null, projectId: string | null = null) =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.files).values({
        id, name: `${id}.step`, r2Key: `users/${ownerId}/${id}.step`, size: 100, mimeType: 'model/step', extension: 'step',
        status: 'uploaded', userId: ownerId, createdAt: at(T0 - 3600), updatedAt: at(T0 - 3600), workspaceId, projectId,
      }),
    ),
  )

export const seedProject = (id: string, workspaceId: string, createdBy: string, accessMode: 'team' | 'restricted' = 'team', manager: string | null = null) =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.projects).values({
        id, workspaceId, name: `Project ${id}`, accessMode, createdByUserId: createdBy, creatorManagerUserId: manager,
        createdAt: at(T0 - 3600), updatedAt: at(T0 - 3600),
      }),
    ),
  )

/** Rows of a table, for count/shape assertions. */
export const rows = <T extends keyof typeof tables>(table: T) =>
  Db.use((db) => db.use((d) => d.select().from(tables[table]).all()))

const tables = {
  organization: schema.organization,
  member: schema.member,
  invitation: schema.invitation,
  resourceInvitations: schema.resourceInvitations,
  projects: schema.projects,
  projectAccess: schema.projectAccess,
  fileAccess: schema.fileAccess,
  accessLog: schema.accessLog,
  shareLinks: schema.shareLinks,
  files: schema.files,
  fileVersions: schema.fileVersions,
  uploadSessions: schema.uploadSessions,
  storageDeletions: schema.storageDeletions,
  securityLog: schema.securityLog,
} as const

