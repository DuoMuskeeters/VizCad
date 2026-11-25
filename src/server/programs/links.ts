import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { AccessExpiryInvalid, LinkConflict, LinkExpired, ResourceUnavailable, ShareLinkLimitReached, ValidationError } from '../errors'
import { AppConfig } from '../services/AppConfig'
import { Db } from '../services/Db'
import { Entitlements } from '../services/Entitlements'
import { decryptToken, encryptToken, hashPassword, newToken, tokenDigest, tokenKeyOf, tokenKeys } from '../shareCrypto'
import { openFile } from './fileContext'
import { activity, authorize, type Caller, guard, maxUnixSeconds, newId, newUlid, runBatch, stillRole, toDate, toSeconds } from './shared'

/** Link password length (docs/09 §4.2). */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export type LinkLevel = (typeof schema.shareLinks.$inferSelect)['level']

type LinkRow = typeof schema.shareLinks.$inferSelect

/** What the sharing dialog needs about a link. Never the token, its digest or ciphertext, or the password hash. */
export interface ShareLinkSummary {
  readonly id: string
  readonly level: LinkLevel
  /** Unix seconds, or null for a link that does not expire. */
  readonly expiresAt: number | null
  readonly hasPassword: boolean
  readonly createdAt: number
  readonly updatedAt: number
  /** Mapped from the old app: it can be revoked or replaced, not edited (docs/09 §4.4). */
  readonly legacy: boolean
  /** Set when the link's time is up but nobody revoked it. */
  readonly expired: boolean
}

export interface ShareSettings {
  readonly links: ReadonlyArray<ShareLinkSummary>
}

const summaryOf = (row: LinkRow, now: number): ShareLinkSummary => {
  const expiresAt = row.expiresAt === null ? null : toSeconds(row.expiresAt)
  const legacyEnd = row.legacyMaxExpiresAt === null ? null : toSeconds(row.legacyMaxExpiresAt)
  return {
    id: row.id,
    level: row.level,
    expiresAt,
    hasPassword: row.passwordHash !== null,
    createdAt: toSeconds(row.createdAt),
    updatedAt: toSeconds(row.updatedAt),
    legacy: row.legacyMaxExpiresAt !== null,
    expired: (expiresAt !== null && now >= expiresAt) || (legacyEnd !== null && now >= legacyEnd),
  }
}

/** The file's links that were not revoked (live or expired), oldest first. */
const activeLinks = Effect.fnUntraced(function* (fileId: string) {
  const db = yield* Db
  return yield* db.use((d) =>
    d.select().from(schema.shareLinks)
      .where(and(eq(schema.shareLinks.fileId, fileId), isNull(schema.shareLinks.revokedAt)))
      .orderBy(asc(schema.shareLinks.createdAt), asc(schema.shareLinks.id)),
  )
})

/** Needs `shareFile`: edit rights, and for a restricted project its manager (permissions.ts decides). */
const openForSharing = Effect.fnUntraced(function* (caller: Caller, workspaceId: string, fileId: string) {
  const opened = yield* openFile(caller, workspaceId, fileId)
  yield* authorize({ ...opened.base, action: { kind: 'shareFile' } })
  return opened
})

const checkPassword = (password: string) =>
  password.length < PASSWORD_MIN || password.length > PASSWORD_MAX || /[\u0000-\u001f]/.test(password)
    ? Effect.fail(new ValidationError({ message: 'invalid link password' }))
    : Effect.void

/** The expiry must be in the future, within the plan's ceiling, and only a plan without a ceiling lets a link live forever. */
const checkExpiry = (expiresAt: number | null, now: number, maxLifetimeSeconds: number | null) => {
  if (expiresAt === null) return maxLifetimeSeconds === null ? Effect.void : Effect.fail(new AccessExpiryInvalid())
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > maxUnixSeconds) return Effect.fail(new AccessExpiryInvalid())
  return maxLifetimeSeconds !== null && expiresAt > now + maxLifetimeSeconds ? Effect.fail(new AccessExpiryInvalid()) : Effect.void
}

/** Links of the workspace that are neither revoked nor past their expiry (what `activeShareLinks` limits). */
const liveCountOf = (workspaceId: string, now: number) =>
  sql`(SELECT count(*) FROM share_links WHERE workspaceId = ${workspaceId} AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ${now}))`

const linkUrl = Effect.fnUntraced(function* (token: string) {
  const { siteUrl } = yield* AppConfig
  return `${siteUrl.origin}/s/${token}`
})

export const getShareSettings = Effect.fn('getShareSettings')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file } = yield* openForSharing(caller, input.workspaceId, input.fileId)
  return { links: (yield* activeLinks(file.id)).map((row) => summaryOf(row, base.now)) } satisfies ShareSettings
})

/**
 * Creates the file's link (docs/09 §4.1): a 32-byte token, kept only as a SHA-256 digest for lookup and AES-GCM
 * ciphertext (active key version) for "copy link". A file has one active link; an expired one and any link mapped from
 * the old app are revoked in the same batch (so "new link" replaces them), a live one makes this `LinkConflict`.
 * The URL is returned here and by `copyShareLink` only.
 */
export const createShareLink = Effect.fn('createShareLink')(function* (
  caller: Caller,
  input: {
    readonly workspaceId: string
    readonly fileId: string
    readonly level: LinkLevel
    readonly expiresAt?: number | null
    readonly password?: string
  },
) {
  const { base, file, role, still, workspace } = yield* openForSharing(caller, input.workspaceId, input.fileId)
  const now = base.now
  const expiresAt = input.expiresAt ?? null
  const limits = yield* (yield* Entitlements).limits(input.workspaceId)
  yield* checkExpiry(expiresAt, now, limits.linkMaxLifetimeSeconds)
  if (input.password !== undefined) yield* checkPassword(input.password)

  const existing = yield* activeLinks(file.id)
  if (existing.some((row) => row.legacyMaxExpiresAt === null && !summaryOf(row, now).expired)) return yield* new LinkConflict()

  if (limits.activeShareLinks !== null) {
    const db = yield* Db
    const counted = yield* db.use((d) => d.get<{ n: number }>(sql`SELECT ${liveCountOf(input.workspaceId, now)} AS n`))
    if ((counted?.n ?? 0) >= limits.activeShareLinks) return yield* new ShareLinkLimitReached()
  }

  const ring = yield* tokenKeys
  const key = yield* tokenKeyOf(ring.active)
  const id = yield* newId
  const token = newToken()
  const digest = yield* tokenDigest(token)
  const ciphertext = yield* encryptToken(key, token, id, input.workspaceId)
  const passwordHash = input.password === undefined ? null : yield* hashPassword(input.password)
  const activityId = yield* newUlid
  const at = toDate(now)
  const liveCount = liveCountOf(input.workspaceId, now)
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}
      AND ${limits.activeShareLinks === null ? sql`1` : sql`${liveCount} < ${limits.activeShareLinks}`}`),
    // Links of the old app and links whose time ran out make room; a live new link would violate the one-active index.
    d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
      .where(and(
        eq(schema.shareLinks.fileId, file.id), isNull(schema.shareLinks.revokedAt),
        sql`(${schema.shareLinks.legacyMaxExpiresAt} IS NOT NULL OR (${schema.shareLinks.expiresAt} IS NOT NULL AND ${schema.shareLinks.expiresAt} <= ${now}))`,
      )),
    d.insert(schema.shareLinks).values({
      id, workspaceId: input.workspaceId, fileId: file.id, createdByUserId: caller.userId, tokenDigest: digest, tokenCiphertext: ciphertext,
      tokenKeyVersion: ring.active, publicSharerLabel: workspace.kind === 'company' ? workspace.name : null, level: input.level,
      passwordHash, expiresAt: expiresAt === null ? null : toDate(expiresAt), legacyMaxExpiresAt: null, revokedAt: null, revision: 1,
      createdAt: at, updatedAt: at,
    }),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'link.created', at: now }, activityId),
  ], [
    ['share_links.fileId', () => new LinkConflict()],
  ])
  const row = (yield* activeLinks(file.id)).find((link) => link.id === id)
  if (row === undefined) return yield* new ResourceUnavailable()
  return { link: summaryOf(row, now), url: yield* linkUrl(token) }
})

/**
 * Changes the file's own link: level, expiry, password (a string sets it, null removes it). Any change bumps the
 * `revision`, which invalidates every password proof cookie issued before. A link from the old app is not editable.
 */
export const updateShareLink = Effect.fn('updateShareLink')(function* (
  caller: Caller,
  input: {
    readonly workspaceId: string
    readonly fileId: string
    readonly level?: LinkLevel
    readonly expiresAt?: number | null
    readonly password?: string | null
  },
) {
  const { base, file, role, still } = yield* openForSharing(caller, input.workspaceId, input.fileId)
  if (input.level === undefined && input.expiresAt === undefined && input.password === undefined) {
    return yield* new ValidationError({ message: 'nothing to update' })
  }
  const now = base.now
  const active = yield* activeLinks(file.id)
  const link = active.find((row) => row.legacyMaxExpiresAt === null)
  if (link === undefined) return yield* active.length > 0 ? new LinkConflict() : new ResourceUnavailable()
  const limits = yield* (yield* Entitlements).limits(input.workspaceId)
  if (input.expiresAt !== undefined) yield* checkExpiry(input.expiresAt, now, limits.linkMaxLifetimeSeconds)
  if (typeof input.password === 'string') yield* checkPassword(input.password)
  const passwordHash = typeof input.password === 'string' ? yield* hashPassword(input.password) : undefined

  // An expired link is not counted as live; moving its end forward makes it live again, so the plan's cap applies once more.
  const revives = summaryOf(link, now).expired && input.expiresAt !== undefined && (input.expiresAt === null || input.expiresAt > now)
  const cap = revives ? limits.activeShareLinks : null
  if (cap !== null) {
    const counted = yield* (yield* Db).use((d) => d.get<{ n: number }>(sql`SELECT ${liveCountOf(input.workspaceId, now)} AS n`))
    if ((counted?.n ?? 0) >= cap) return yield* new ShareLinkLimitReached()
  }

  const at = toDate(now)
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)} AND EXISTS (
      SELECT 1 FROM share_links WHERE id = ${link.id} AND revision = ${link.revision} AND revokedAt IS NULL)
      AND ${cap === null ? sql`1` : sql`${liveCountOf(input.workspaceId, now)} < ${cap}`}`),
    d.update(schema.shareLinks).set({
      ...(input.level === undefined ? {} : { level: input.level }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt === null ? null : toDate(input.expiresAt) }),
      ...(input.password === undefined ? {} : { passwordHash: input.password === null ? null : passwordHash ?? null }),
      revision: link.revision + 1, updatedAt: at,
    }).where(and(eq(schema.shareLinks.id, link.id), eq(schema.shareLinks.revision, link.revision), isNull(schema.shareLinks.revokedAt))),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'link.updated', at: now }, activityId),
  ])
  return { links: (yield* activeLinks(file.id)).map((row) => summaryOf(row, now)) } satisfies ShareSettings
})

/** Turns off the file's link (one by id, or every active one). The revision moves on, so old proof cookies die with it. */
export const revokeShareLink = Effect.fn('revokeShareLink')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly linkId?: string },
) {
  const { base, file, role } = yield* openForSharing(caller, input.workspaceId, input.fileId)
  const targets = (yield* activeLinks(file.id)).filter((row) => input.linkId === undefined || row.id === input.linkId)
  if (targets.length === 0) return yield* new ResourceUnavailable()
  const at = toDate(base.now)
  const activityIds = yield* Effect.forEach(targets, () => newUlid)
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])}`),
    ...targets.flatMap((row, i) => [
      d.update(schema.shareLinks).set({ revokedAt: at, revision: sql`${schema.shareLinks.revision} + 1`, updatedAt: at })
        .where(and(eq(schema.shareLinks.id, row.id), isNull(schema.shareLinks.revokedAt))),
      activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'link.revoked', at: base.now }, activityIds[i] ?? row.id),
    ]),
  ])
  return { links: (yield* activeLinks(file.id)).map((row) => summaryOf(row, base.now)) } satisfies ShareSettings
})

/**
 * Returns the link's URL again ("Copy link"): decrypts the stored token with its key version. Needs `shareFile`, like every
 * management action, and is recorded as `link.copied`. A link past its expiry is not handed out.
 */
export const copyShareLink = Effect.fn('copyShareLink')(function* (
  caller: Caller,
  input: { readonly workspaceId: string; readonly fileId: string; readonly linkId?: string },
) {
  const { base, file, role } = yield* openForSharing(caller, input.workspaceId, input.fileId)
  const active = yield* activeLinks(file.id)
  const link = input.linkId === undefined
    ? active.find((row) => row.legacyMaxExpiresAt === null) ?? (active.length === 1 ? active[0] : undefined)
    : active.find((row) => row.id === input.linkId)
  if (link === undefined) return yield* new ResourceUnavailable()
  if (summaryOf(link, base.now).expired) return yield* new LinkExpired({ sharer: null })
  const token = yield* decryptToken(yield* tokenKeyOf(link.tokenKeyVersion), link.tokenCiphertext, link.id, link.workspaceId)
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND EXISTS (
      SELECT 1 FROM share_links WHERE id = ${link.id} AND revokedAt IS NULL)`),
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'link.copied', at: base.now }, activityId),
  ])
  return { link: summaryOf(link, base.now), url: yield* linkUrl(token) }
})
