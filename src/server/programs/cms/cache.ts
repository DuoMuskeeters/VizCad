import { asc, count, gte } from 'drizzle-orm'
import { Effect } from 'effect'
import { isMarketingPath } from '#/shared/marketingRoutes'
import * as schema from '../../db/schema'
import { CacheError, ValidationError } from '../../errors'
import { AppConfig } from '../../services/AppConfig'
import { Cache, CacheErrorReason, siteUrlOf } from '../../services/Cache'
import { Db } from '../../services/Db'
import { toUnixSeconds } from '../../time'
import { DRAIN_MAX_CALLS, drainCachePurges, enqueuePurges, MAX_ATTEMPTS, PUBLISH_MAX_CALLS } from '../cachePurges'
import { nowSeconds, runBatch } from '../shared'

/**
 * Admin cache operations behind `/api/cms` (docs/12 §3.2, §9 "Önbellek"): the purge queue, its drain, and manual
 * purges of site URLs or the site hostname. Every write goes through the queue (`cache_purges`) like a publish, so a
 * failed purge stays visible and the cron finishes it. Callers are platform admins (http/cms.ts checks that first).
 */

export interface PurgeRow {
  readonly id: number
  readonly kind: 'url' | 'host'
  readonly target: string
  readonly reason: string
  readonly attempts: number
  readonly lastError: string | null
  /** Unix seconds. */
  readonly notBefore: number
  readonly createdAt: number
  /** Out of automatic retries (`MAX_ATTEMPTS`); only a manual purge moves the target again. */
  readonly failed: boolean
}

/** The queue, oldest due first, and whether purging is configured at all (the screen's red banner, K5). */
export const listPurges = Effect.fn('listPurges')(function* (input: { readonly limit: number }) {
  const db = yield* Db
  const cache = yield* Cache
  const [rows, [total], [failed]] = yield* db.use((d) =>
    d.batch([
      d.select().from(schema.cachePurges).orderBy(asc(schema.cachePurges.notBefore), asc(schema.cachePurges.id)).limit(input.limit),
      d.select({ n: count() }).from(schema.cachePurges),
      d.select({ n: count() }).from(schema.cachePurges).where(gte(schema.cachePurges.attempts, MAX_ATTEMPTS)),
    ]),
  )
  return {
    configured: cache.configured,
    total: total?.n ?? 0,
    failed: failed?.n ?? 0,
    rows: rows.map((r): PurgeRow => ({
      id: r.id,
      kind: r.kind,
      target: r.target,
      reason: r.reason,
      attempts: r.attempts,
      lastError: r.lastError,
      notBefore: toUnixSeconds(r.notBefore),
      createdAt: toUnixSeconds(r.createdAt),
      failed: r.attempts >= MAX_ATTEMPTS,
    })),
  }
})

/** A purge without config would only pretend (docs/12 rule 2): refused before anything is queued. */
export const requireConfigured = Effect.gen(function* () {
  const cache = yield* Cache
  if (!cache.configured) return yield* new CacheError({ reason: CacheErrorReason.notConfigured })
})

/** Runs the queue now, as many API calls as a request of this kind may make. */
export const drainPurges = Effect.fn('drainPurges')(function* () {
  yield* requireConfigured
  return { purge: yield* drainCachePurges({ maxCalls: DRAIN_MAX_CALLS }) }
})

/**
 * Queues the given site URLs (absolute, on the site origin, no query, inside the edge-cached marketing space) twice,
 * now and 60 s later, and drains right away with the publish budget. A URL off the site or outside the cached space
 * is a bad request: purging it could never change anything.
 */
export const purgeUrls = Effect.fn('purgeUrls')(function* (input: { readonly urls: ReadonlyArray<string> }) {
  yield* requireConfigured
  const { siteUrl } = yield* AppConfig
  const urls = new Set<string>()
  for (const raw of input.urls) {
    const url = siteUrlOf(siteUrl, raw)
    if (url === undefined || !isMarketingPath(url.pathname)) return yield* new ValidationError({ message: 'urls must be cached pages of the site' })
    // Origin and path only: no credentials or fragment from the given URL are stored.
    urls.add(`${url.origin}${url.pathname}`)
  }
  const now = yield* nowSeconds
  yield* runBatch((d) => enqueuePurges(d, { targets: { urls: [...urls], host: false }, hostname: siteUrl.hostname, reason: 'manual', now }))
  return { urls: urls.size, purge: yield* drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS }) }
})

/** Hostname purge of the site host only (never `purge_everything`, never another host): one API call. */
export const purgeSiteHost = Effect.fn('purgeSiteHost')(function* () {
  yield* requireConfigured
  const { siteUrl } = yield* AppConfig
  const now = yield* nowSeconds
  yield* runBatch((d) => enqueuePurges(d, { targets: { urls: [], host: true }, hostname: siteUrl.hostname, reason: 'manual', now }))
  return { hostname: siteUrl.hostname, purge: yield* drainCachePurges({ maxCalls: 1 }) }
})
