import { Context, Effect, Layer, Ref } from 'effect'
import { CacheError } from '../errors'
import { AppConfig } from './AppConfig'

/** Purge-by-URL takes at most this many URLs per API call (docs/12 §7.4). */
export const PURGE_BATCH = 100

/**
 * Zone-wide edge cache purge (D4, docs/12 §7.4). Reads and writes of cached pages are not here: they run on the hit
 * path without Effect (EdgeCache.ts). Every purge fails with CacheError when CF_ZONE_ID/CF_PURGE_TOKEN are missing
 * (a local-only delete is not a publish success), and only the `siteUrl` host is ever accepted: the token can purge
 * the whole zone, so this check is the only thing keeping staging off the production cache.
 * Live layer: Cache.live.ts. Test layer: `memory` / `memoryWith` (records calls in CachePurges).
 */
export class Cache extends Context.Service<
  Cache,
  {
    /** Whether zone purge is configured. The drain skips (and logs) without touching the queue when it is not. */
    readonly configured: boolean
    /** One API call per `PURGE_BATCH` URLs. URLs are absolute on the site host, without the `?v=` build suffix. */
    readonly purge: (urls: ReadonlyArray<string>) => Effect.Effect<void, CacheError>
    /** Hostname purge (one API call). `CacheError` reason `rate-limited` on HTTP 429. */
    readonly purgeHost: (hostname: string) => Effect.Effect<void, CacheError>
  }
>()('vizcad/Cache') {}

/** Fixed reasons callers branch on. Other reasons carry the API's own message. */
export const CacheErrorReason = {
  notConfigured: 'purge-not-configured',
  foreignHost: 'purge-foreign-host',
  rateLimited: 'rate-limited',
} as const

/** A purgeable URL: absolute, on the site's scheme and host, without query or fragment. */
export const siteUrlOf = (siteUrl: URL, raw: string): URL | undefined => {
  const url = URL.canParse(raw) ? new URL(raw) : undefined
  return url !== undefined && url.origin === siteUrl.origin && url.search === '' && url.hash === '' ? url : undefined
}

export const isSiteHost = (siteUrl: URL, hostname: string): boolean => hostname === siteUrl.hostname

/**
 * Validates purge targets against the site host. Shared by the live and the memory layer. One foreign URL fails the
 * whole call, so the drain drops such queue rows before batching (cachePurges.ts).
 */
export const checkUrls = (siteUrl: URL, urls: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<URL>, CacheError> =>
  Effect.forEach(urls, (raw) => {
    const url = siteUrlOf(siteUrl, raw)
    return url !== undefined ? Effect.succeed(url) : Effect.fail(new CacheError({ reason: CacheErrorReason.foreignHost }))
  })

export const checkHost = (siteUrl: URL, hostname: string): Effect.Effect<void, CacheError> =>
  isSiteHost(siteUrl, hostname) ? Effect.void : Effect.fail(new CacheError({ reason: CacheErrorReason.foreignHost }))

export type PurgeCall = { readonly kind: 'url'; readonly urls: ReadonlyArray<string> } | { readonly kind: 'host'; readonly hostname: string }

/** Every API call the in-memory layer would have made, in order. */
export class CachePurges extends Context.Service<CachePurges, Ref.Ref<ReadonlyArray<PurgeCall>>>()('vizcad/test/CachePurges') {}

export interface MemoryOptions {
  readonly configured?: boolean
  /** Return an error to fail that call (after validation, as the API would). */
  readonly fail?: (call: PurgeCall) => CacheError | undefined
}

/** In-memory layer: validates like the live layer, records each would-be API call. Needs AppConfig (site host). */
export const memoryWith = (options: MemoryOptions = {}) =>
  Layer.effect(
    Cache,
    Effect.gen(function* () {
      const calls = yield* CachePurges
      const { siteUrl } = yield* AppConfig
      const configured = options.configured ?? true
      const record = (call: PurgeCall) => {
        const error = options.fail?.(call)
        return Ref.update(calls, (all) => [...all, call]).pipe(Effect.andThen(error === undefined ? Effect.void : Effect.fail(error)))
      }
      const notConfigured = Effect.fail(new CacheError({ reason: CacheErrorReason.notConfigured }))
      return Cache.of({
        configured,
        purge: (urls) =>
          Effect.gen(function* () {
            if (!configured) return yield* notConfigured
            yield* checkUrls(siteUrl, urls)
            for (let i = 0; i < urls.length; i += PURGE_BATCH) yield* record({ kind: 'url', urls: urls.slice(i, i + PURGE_BATCH) })
          }),
        purgeHost: (hostname) =>
          Effect.gen(function* () {
            if (!configured) return yield* notConfigured
            yield* checkHost(siteUrl, hostname)
            yield* record({ kind: 'host', hostname })
          }),
      })
    }),
  ).pipe(Layer.provideMerge(Layer.effect(CachePurges, Ref.make<ReadonlyArray<PurgeCall>>([]))))

export const memory = memoryWith()
