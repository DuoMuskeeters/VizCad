import { and, eq, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { CaptchaFailed, LinkExpired, LinkPasswordInvalid, LinkPasswordRequired, LinkUnavailable, PermissionDenied, PreviewUnavailable, ValidationError } from '../errors'
import { decidePermission, type DenialReason, type PermissionInput } from '../permissions'
import type { LinkFileView, ResolvedLink } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { RateLimit } from '../services/RateLimit'
import { Turnstile } from '../services/Turnstile'
import {
  isTokenFormat, PROOF_MAX_SECONDS, type PasswordProof, proofKey, proofSetCookie, readProof, signProof, tokenDigest, verifyPassword,
} from '../shareCrypto'
import { recordDenied, recordDelivery } from './audit'
import { streamContent, streamThumbnail } from './delivery'
import { fileForPermission, nowSeconds, toSeconds, truncateIp, truncateUserAgent, type Trace } from './shared'

/** What the link endpoints know about a request: no session, only the visitor's address, agent and cookies. */
export interface LinkRequest {
  readonly requestId: string
  readonly ip: string | null
  readonly userAgent: string | null
  /** The raw `Cookie` header, for the password proof. */
  readonly cookie: string | null
}

const traceOf = (request: LinkRequest): Trace => ({
  requestId: request.requestId, ip: truncateIp(request.ip), userAgent: truncateUserAgent(request.userAgent),
})

/** Failures that make the visitor prove they are human (docs/09 §4.2): three from this address, ten from anyone, in 15 minutes. */
export const CAPTCHA_AFTER_IP_FAILURES = 3
export const CAPTCHA_AFTER_LINK_FAILURES = 10
const FAILURE_WINDOW_SECONDS = 15 * 60

/** The link, its file and the context permissions.ts needs, read in one query by the token's digest. */
const loadByToken = Effect.fnUntraced(function* (token: string) {
  if (!isTokenFormat(token)) return yield* new LinkUnavailable()
  const digest = yield* tokenDigest(token)
  const db = yield* Db
  const f = schema.files
  const rows = yield* db.use((d) =>
    d.select({
      link: schema.shareLinks,
      file: {
        id: f.id, name: f.name, extension: f.extension, size: f.size, workspaceId: f.workspaceId, projectId: f.projectId, isDeleted: f.isDeleted,
        status: f.status, updatedAt: f.updatedAt, r2Key: f.r2Key, thumbnailR2Key: f.thumbnailR2Key, contentEtag: f.contentEtag,
        // NULL currentVersionNumber is a legacy row: COUNT(file_versions) + 1 (docs/09 §1.4).
        versionNumber: sql<number>`COALESCE(${f.currentVersionNumber}, (SELECT count(*) FROM file_versions v WHERE v.fileId = ${f.id}) + 1)`,
      },
      workspace: { id: schema.organization.id, name: schema.organization.name, kind: schema.organization.kind, archivedAt: schema.organization.archivedAt },
      project: {
        id: schema.projects.id, workspaceId: schema.projects.workspaceId, accessMode: schema.projects.accessMode, archivedAt: schema.projects.archivedAt,
        createdByUserId: schema.projects.createdByUserId, creatorManagerUserId: schema.projects.creatorManagerUserId,
      },
      sharerName: schema.user.name,
    }).from(schema.shareLinks)
      .innerJoin(f, and(eq(f.id, schema.shareLinks.fileId), eq(f.workspaceId, schema.shareLinks.workspaceId)))
      .innerJoin(schema.organization, eq(schema.organization.id, schema.shareLinks.workspaceId))
      .leftJoin(schema.projects, eq(schema.projects.id, f.projectId))
      .leftJoin(schema.user, eq(schema.user.id, schema.shareLinks.createdByUserId))
      .where(eq(schema.shareLinks.tokenDigest, digest))
      .limit(1),
  )
  const row = rows[0]
  if (row === undefined || row.file.workspaceId === null) return yield* new LinkUnavailable()
  return { ...row, workspaceId: row.file.workspaceId }
})

type Loaded = Effect.Success<ReturnType<typeof loadByToken>>

const seconds = (date: Date | null) => (date === null ? null : toSeconds(date))

/** The permission input for the link as it is now, with the password proof only when its MAC checked out. */
const inputFor = (row: Loaded, now: number, proof: PasswordProof | undefined): Omit<PermissionInput, 'action'> => ({
  actor: {
    kind: 'link',
    link: {
      id: row.link.id, workspaceId: row.link.workspaceId, fileId: row.link.fileId, level: row.link.level, expiresAt: seconds(row.link.expiresAt),
      legacyMaxExpiresAt: seconds(row.link.legacyMaxExpiresAt), revokedAt: seconds(row.link.revokedAt), revision: row.link.revision,
      requiresPassword: row.link.passwordHash !== null,
    },
    ...(proof === undefined ? {} : { passwordProof: proof }),
  },
  workspace: { id: row.workspace.id, kind: row.workspace.kind, archived: row.workspace.archivedAt !== null },
  file: fileForPermission({ id: row.file.id, workspaceId: row.workspaceId, projectId: row.file.projectId, isDeleted: row.file.isDeleted, status: row.file.status }, row.workspaceId),
  ...(row.project === null || row.project.id === null ? {} : {
    project: {
      id: row.project.id, workspaceId: row.project.workspaceId ?? row.workspaceId, accessMode: row.project.accessMode ?? 'team',
      archived: row.project.archivedAt !== null, createdByUserId: row.project.createdByUserId ?? '', creatorManagerUserId: row.project.creatorManagerUserId,
    },
  }),
  now,
})

const sharerOf = (row: Loaded) => row.sharerName ?? row.link.publicSharerLabel ?? row.workspace.name

/** The one tagged error each denial maps to; `LINK_PROOF_REQUIRED` is handled by the caller (a gate or a 401). */
const refusal = (reason: DenialReason, row: Loaded) => {
  switch (reason) {
    case 'LINK_EXPIRED': return new LinkExpired({ sharer: sharerOf(row) })
    case 'LINK_PROOF_REQUIRED': return new LinkPasswordRequired()
    case 'INSUFFICIENT_LEVEL': return new PermissionDenied({ reason })
    default: return new LinkUnavailable()
  }
}

/** Decides one action for the link, reading the proof cookie first; the first failure is the answer. */
const decide = Effect.fnUntraced(function* (request: LinkRequest, row: Loaded, action: 'view' | 'preview' | 'download') {
  const now = yield* nowSeconds
  const key = yield* proofKey
  const proof = row.link.passwordHash === null ? undefined : yield* readProof(key, request.cookie, row.link.id, row.link.revision, now)
  const input = inputFor(row, now, proof)
  const decision = decidePermission({ ...input, action: { kind: action } })
  return { now, decision, input }
})

const fileView = (row: Loaded, input: Omit<PermissionInput, 'action'>): LinkFileView => ({
  name: row.file.name,
  extension: row.file.extension,
  size: row.file.size,
  updatedAt: toSeconds(row.file.updatedAt),
  currentVersion: { number: row.file.versionNumber },
  thumbnailAvailable: row.file.thumbnailR2Key !== null,
  can: { download: decidePermission({ ...input, action: { kind: 'download' } }).allowed, comment: false },
  sharer: { displayName: sharerOf(row), workspaceLabel: row.link.publicSharerLabel },
  expiresAt: seconds(row.link.expiresAt),
})

/**
 * `/s/{token}` (docs/09 §4.3): token format, then the per-IP rate limit, then one lookup by digest. Unknown, revoked,
 * trashed or archived: `LinkUnavailable` (one answer). Past its time: `LinkExpired` with the sharer's name. Needs a
 * password and no valid proof cookie: the gate, which carries nothing about the file. Otherwise the file card, and a
 * `link.opened` audit row (one per ten minutes) with the visitor's IP in the security log only.
 */
export const resolveShareLink = Effect.fn('resolveShareLink')(function* (request: LinkRequest, token: string) {
  if (!isTokenFormat(token)) return yield* new LinkUnavailable()
  yield* (yield* RateLimit).hit({ action: 'linkOpen', ip: request.ip })
  const row = yield* loadByToken(token)
  const { now, decision, input } = yield* decide(request, row, 'view')
  if (!decision.allowed) {
    if (decision.reason === 'LINK_PROOF_REQUIRED') return { kind: 'password' } satisfies ResolvedLink
    return yield* refusal(decision.reason, row)
  }
  yield* recordDelivery({
    workspaceId: row.workspaceId, actor: { kind: 'link', linkId: row.link.id }, fileId: row.file.id, objectKey: row.file.r2Key, purpose: 'open',
    trace: traceOf(request), now,
  })
  return { kind: 'file', file: fileView(row, input) } satisfies ResolvedLink
})

const recentFailures = Effect.fnUntraced(function* (linkId: string, ip: string | null, now: number) {
  const db = yield* Db
  const counted = yield* db.use((d) =>
    d.get<{ total: number; mine: number }>(sql`SELECT count(*) AS total, COALESCE(SUM(ip IS ${ip}), 0) AS mine FROM security_log
      WHERE event = 'link_password_failed' AND targetId = ${linkId} AND createdAt > ${now - FAILURE_WINDOW_SECONDS}`),
  )
  return { total: counted?.total ?? 0, mine: counted?.mine ?? 0 }
})

/**
 * `POST /api/s/password` (docs/09 §4.2). Order: rate limits per visitor and link and per link alone (429 before any hashing), the link, Turnstile once this address
 * failed three times (or the link ten times), then PBKDF2 and a constant-time comparison. A wrong password is audited
 * (`link.password_failed`, with the IP in the security log) and answers `LinkPasswordInvalid` (`captchaRequired` tells the
 * page to show the widget). A right one returns the `Set-Cookie` value of the proof (`__Host-`, HMAC over link, revision
 * and expiry), good for at most 12 hours and never past the link's own end.
 */
export const verifyLinkPassword = Effect.fn('verifyLinkPassword')(function* (
  request: LinkRequest,
  input: { readonly token: string; readonly password: string; readonly turnstileToken?: string | undefined },
) {
  if (!isTokenFormat(input.token)) return yield* new LinkUnavailable()
  if (input.password.length < 1 || input.password.length > 128) return yield* new ValidationError({ message: 'invalid password' })
  const digest = yield* tokenDigest(input.token)
  yield* (yield* RateLimit).hit({ action: 'linkPassword', ip: request.ip, target: `${request.ip ?? 'none'}|${digest}` })
  // Every visitor together, before any hashing: the failure log below only informs the hint, this counter is the hard bound.
  yield* (yield* RateLimit).hit({ action: 'linkPasswordLink', target: digest })
  const row = yield* loadByToken(input.token)
  const { now, decision } = yield* decide(request, row, 'view')
  if (!decision.allowed && decision.reason !== 'LINK_PROOF_REQUIRED') return yield* refusal(decision.reason, row)
  const hash = row.link.passwordHash
  // A link without a password, or one this visitor already proved: nothing to verify, no cookie needed.
  if (hash === null || decision.allowed) return { setCookie: null, expiresAt: null }

  // `captchaRequired` is only a hint for the page; the server asks for Turnstile whenever the thresholds say so.
  const failures = yield* recentFailures(row.link.id, truncateIp(request.ip), now)
  if (failures.mine >= CAPTCHA_AFTER_IP_FAILURES || failures.total >= CAPTCHA_AFTER_LINK_FAILURES) {
    if (input.turnstileToken === undefined || input.turnstileToken === '') return yield* new CaptchaFailed({ reason: 'required' })
    yield* (yield* Turnstile).verify({ token: input.turnstileToken, action: 'share-password', ip: request.ip })
  }

  if (!(yield* verifyPassword(hash, input.password))) {
    yield* recordDenied({
      workspaceId: row.workspaceId, actor: { kind: 'link', linkId: row.link.id }, fileId: row.file.id, action: 'link.password_failed',
      reason: 'password', security: true, trace: traceOf(request), now,
    })
    return yield* new LinkPasswordInvalid({
      captchaRequired: failures.mine + 1 >= CAPTCHA_AFTER_IP_FAILURES || failures.total + 1 >= CAPTCHA_AFTER_LINK_FAILURES,
    })
  }
  const ends = [seconds(row.link.expiresAt), seconds(row.link.legacyMaxExpiresAt)].filter((end): end is number => end !== null)
  const expiresAt = Math.min(now + PROOF_MAX_SECONDS, ...ends)
  const value = yield* signProof(yield* proofKey, row.link.id, row.link.revision, expiresAt)
  const setCookie = proofSetCookie(row.link.id, value, expiresAt - now)
  if (setCookie === undefined) return yield* new LinkUnavailable()
  return { setCookie, expiresAt }
})

const LINK_HEADERS = { 'referrer-policy': 'no-referrer' } as const

/** `GET /s/{token}/content`: the current version's bytes, only for a `download` link with its proof; audited as `file.downloaded`. */
export const deliverLinkContent = Effect.fn('deliverLinkContent')(function* (request: LinkRequest, token: string, range: string | null) {
  const row = yield* loadByToken(token)
  const { now, decision } = yield* decide(request, row, 'download')
  if (!decision.allowed) return yield* refusal(decision.reason, row)
  const trace = traceOf(request)
  const actor = { kind: 'link', linkId: row.link.id } as const
  yield* recordDelivery({ workspaceId: row.workspaceId, actor, fileId: row.file.id, objectKey: row.file.r2Key, purpose: 'download', trace, now })
  return yield* streamContent({
    object: { key: row.file.r2Key, size: row.file.size, etag: row.file.contentEtag }, name: row.file.name, range, extraHeaders: LINK_HEADERS,
  }).pipe(
    Effect.tapError((error) =>
      error._tag !== 'ContentIntegrity' ? Effect.void : Effect.logWarning('delivery integrity check failed').pipe(
        Effect.annotateLogs({ requestId: request.requestId }),
        Effect.andThen(recordDenied({ workspaceId: row.workspaceId, actor, fileId: row.file.id, action: 'file.downloaded', reason: 'integrity', security: false, trace, now })),
        Effect.ignore,
      )),
  )
})

/** `GET /s/{token}/thumbnail`: the current thumbnail for any live link (`view` suffices); audited as `file.previewed`. */
export const deliverLinkThumbnail = Effect.fn('deliverLinkThumbnail')(function* (request: LinkRequest, token: string) {
  const row = yield* loadByToken(token)
  const { now, decision } = yield* decide(request, row, 'preview')
  if (!decision.allowed) return yield* refusal(decision.reason, row)
  if (row.file.thumbnailR2Key === null) return yield* new PreviewUnavailable()
  yield* recordDelivery({
    workspaceId: row.workspaceId, actor: { kind: 'link', linkId: row.link.id }, fileId: row.file.id, objectKey: row.file.thumbnailR2Key, purpose: 'preview',
    trace: traceOf(request), now,
  })
  return yield* streamThumbnail(row.file.thumbnailR2Key, LINK_HEADERS)
})
