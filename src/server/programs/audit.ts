import { Effect } from 'effect'
import * as schema from '../db/schema'
import { auditId, proofKey } from '../shareCrypto'
import { newUlid, runBatch, toDate, type Trace } from './shared'

/** Who a delivery or link event is attributed to. Users by id, links by link id (never by token). */
export type AuditActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'link'; readonly linkId: string }

export type DeliveryPurpose = 'download' | 'preview' | 'open'

const OF_PURPOSE = {
  download: { action: 'file.downloaded', security: 'file_downloaded' },
  preview: { action: 'file.previewed', security: null },
  open: { action: 'link.opened', security: 'link_opened' },
} as const

const actorColumns = (actor: AuditActor) =>
  actor.kind === 'user'
    ? { actorKind: 'user', actorUserId: actor.userId, linkId: null } as const
    : { actorKind: 'link', actorUserId: null, linkId: actor.linkId } as const

export interface DeliveryAudit {
  readonly workspaceId: string
  readonly actor: AuditActor
  readonly fileId: string
  /** The R2 key delivered; part of the dedupe id only, never stored. */
  readonly objectKey: string
  readonly purpose: DeliveryPurpose
  readonly trace: Trace
  readonly now: number
}

/**
 * Audit before delivery (docs/09 §3.4): one `access_log` row (ids and a fixed action name only, never IP or user agent)
 * and, for downloads and link opens, one `security_log` row (IP and truncated user agent, D21). Both ids are HMACs, the
 * security one over the IP too, so `ON CONFLICT DO NOTHING` keeps one access row per actor, object and ten minute window
 * and one security row per address in it however many
 * Range parts or reloads follow. A failed write fails the delivery: nothing is streamed without its record.
 */
export const recordDelivery = Effect.fnUntraced(function* (input: DeliveryAudit) {
  const id = yield* proofKey.pipe(
    Effect.flatMap((key) => auditId(key, input.purpose, input.actor.kind === 'user' ? `user:${input.actor.userId}` : `link:${input.actor.linkId}`, input.fileId, input.objectKey, input.now)),
  )
  // The security row is keyed by the visitor's IP as well: a second address in the same window is a second row (docs/09 §3.4).
  const securityId = yield* proofKey.pipe(
    Effect.flatMap((key) => auditId(key, `${input.purpose}.security`, `${input.actor.kind === 'user' ? `user:${input.actor.userId}` : `link:${input.actor.linkId}`}|ip:${input.trace.ip ?? 'none'}`, input.fileId, input.objectKey, input.now)),
  )
  const { action, security } = OF_PURPOSE[input.purpose]
  const at = toDate(input.now)
  yield* runBatch((d) => [
    d.insert(schema.accessLog).values({
      id, workspaceId: input.workspaceId, ...actorColumns(input.actor), targetKind: 'file', targetId: input.fileId, action,
      outcome: 'allowed', requestId: input.trace.requestId, createdAt: at, reason: null,
    }).onConflictDoNothing(),
    ...(security === null ? [] : [d.insert(schema.securityLog).values({
      id: securityId, createdAt: at, event: security, userId: input.actor.kind === 'user' ? input.actor.userId : null, workspaceId: input.workspaceId,
      targetId: input.actor.kind === 'link' && input.purpose === 'open' ? input.actor.linkId : input.fileId,
      ip: input.trace.ip, userAgent: input.trace.userAgent, requestId: input.trace.requestId,
    }).onConflictDoNothing()]),
  ])
})

export interface DeniedAudit {
  readonly workspaceId: string
  readonly actor: AuditActor
  readonly fileId: string
  /** `access_log.action`: `link.password_failed` or the delivery action that failed its integrity check. */
  readonly action: 'link.password_failed' | 'file.downloaded' | 'file.previewed'
  /** A fixed code, never user input. */
  readonly reason: 'password' | 'integrity'
  /** Set for `link.password_failed`: the security log gets the same event with the visitor's IP. */
  readonly security: boolean
  readonly trace: Trace
  readonly now: number
}

/** The two kinds of refusal the access log records (docs/09 §7.1): a wrong link password and a failed integrity check. */
export const recordDenied = Effect.fnUntraced(function* (input: DeniedAudit) {
  const id = yield* newUlid
  const at = toDate(input.now)
  yield* runBatch((d) => [
    d.insert(schema.accessLog).values({
      id, workspaceId: input.workspaceId, ...actorColumns(input.actor), targetKind: 'file', targetId: input.fileId, action: input.action,
      outcome: 'denied', requestId: input.trace.requestId, createdAt: at, reason: input.reason,
    }),
    ...(!input.security ? [] : [d.insert(schema.securityLog).values({
      id, createdAt: at, event: 'link_password_failed', userId: null, workspaceId: input.workspaceId,
      targetId: input.actor.kind === 'link' ? input.actor.linkId : input.fileId,
      ip: input.trace.ip, userAgent: input.trace.userAgent, requestId: input.trace.requestId,
    })]),
  ])
})
