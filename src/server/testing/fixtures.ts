import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
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
import * as Turnstile from '../services/Turnstile'
import { Storage as StorageService } from '../services/Storage'
import { encryptToken, hashPassword, tokenDigest, tokenKeyOf } from '../shareCrypto'

/** Fixed test clock start: 2026-11-24T10:00:00Z. Tests move it with TestClock.adjust. */
export const T0 = 1795514400

/** Every layer a product program may need, all in memory (node only). */
export const programLayer = (limits: Entitlements.WorkspaceLimits = Entitlements.defaultPlan, config: Partial<AppConfig.AppConfig['Service']> = {}) =>
  Layer.mergeAll(
    DbMemory.memory,
    Auth.memory,
    Email.memory,
    RateLimit.memory,
    Entitlements.fixed(limits),
    Background.inline,
    Storage.memory,
    Turnstile.test,
  ).pipe(Layer.provideMerge(AppConfig.test(config)))

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

/** The uploader's own `edit` grant that `completeUpload` writes (docs/08 §4). */
export const seedUploaderGrant = (fileId: string, userId: string, workspaceId: string) =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.fileAccess).values({
        workspaceId, fileId, userId, level: 'edit', expiresAt: null, grantedByUserId: userId, source: 'uploader',
        createdAt: at(T0 - 3600), updatedAt: at(T0 - 3600),
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
  fileStars: schema.fileStars,
  uploadSessions: schema.uploadSessions,
  storageDeletions: schema.storageDeletions,
  securityLog: schema.securityLog,
} as const


/** A file whose bytes really sit in the in-memory bucket: key, size and ETag in D1 match the object (a 0014-style row). */
export const seedStoredFile = (
  id: string,
  ownerId: string,
  workspaceId: string,
  bytes: Uint8Array | string,
  options: { name?: string; projectId?: string | null; legacy?: boolean } = {},
) =>
  Effect.gen(function* () {
    const key = options.legacy ? `${ownerId}/${id}/${options.name ?? `${id}.step`}` : `w/${workspaceId}/f/${id}/obj-${id}`
    const stored = yield* StorageService.use((storage) => storage.put(key, bytes))
    yield* seedFile(id, ownerId, workspaceId, options.projectId ?? null)
    yield* Db.use((db) =>
      db.use((d) =>
        d.update(schema.files).set({
          r2Key: key, size: stored.size, contentEtag: options.legacy ? null : stored.etag, name: options.name ?? `${id}.step`,
          ...(options.legacy ? {} : { currentVersionNumber: 1 }),
        }).where(eq(schema.files.id, id)),
      ),
    )
    return { key, size: stored.size, etag: stored.etag }
  })

/** A guest's grant on a file (guests always get a finite expiry). */
export const seedFileGrant = (fileId: string, userId: string, workspaceId: string, level: 'view' | 'comment' | 'download', expiresAt: number | null = T0 + 86400) =>
  Db.use((db) =>
    db.use((d) =>
      d.insert(schema.fileAccess).values({
        workspaceId, fileId, userId, level, expiresAt: expiresAt === null ? null : at(expiresAt), grantedByUserId: null, source: 'grant',
        createdAt: at(T0 - 3600), updatedAt: at(T0 - 3600),
      }),
    ),
  )

/** A link row written the way the cutover mapping would (legacy ceiling set), or a plain one; the token is returned. */
export const seedLink = (
  id: string,
  fileId: string,
  workspaceId: string,
  options: {
    token?: string
    level?: 'view' | 'download'
    password?: string
    expiresAt?: number | null
    legacyMaxExpiresAt?: number | null
    revokedAt?: number | null
    revision?: number
    keyVersion?: number
    createdBy?: string | null
    label?: string | null
  } = {},
) =>
  Effect.gen(function* () {
    const token = options.token ?? 'abcdefghijklmnopqrstuvwxyz012345'
    const keyVersion = options.keyVersion ?? 2
    const key = yield* tokenKeyOf(keyVersion)
    const digest = yield* tokenDigest(token)
    const ciphertext = yield* encryptToken(key, token, id, workspaceId)
    const passwordHash = options.password === undefined ? null : yield* hashPassword(options.password)
    yield* Db.use((db) =>
      db.use((d) =>
        d.insert(schema.shareLinks).values({
          id, workspaceId, fileId, createdByUserId: options.createdBy === undefined ? 'bob' : options.createdBy, tokenDigest: digest,
          tokenCiphertext: ciphertext, tokenKeyVersion: keyVersion, publicSharerLabel: options.label === undefined ? 'Workspace acme' : options.label,
          level: options.level ?? 'download', passwordHash,
          expiresAt: options.expiresAt === undefined || options.expiresAt === null ? null : at(options.expiresAt),
          legacyMaxExpiresAt: options.legacyMaxExpiresAt === undefined || options.legacyMaxExpiresAt === null ? null : at(options.legacyMaxExpiresAt),
          revokedAt: options.revokedAt === undefined || options.revokedAt === null ? null : at(options.revokedAt),
          revision: options.revision ?? 1, createdAt: at(T0 - 3600), updatedAt: at(T0 - 3600),
        }),
      ),
    )
    return token
  })
