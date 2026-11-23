import { Effect, Layer, Option, Redacted, Schema } from 'effect'
import { CacheError } from '../errors'
import { AppConfig } from './AppConfig'
import { Cache } from './Cache'

/** The part of the Workers Cache API (`caches.default`) this service uses. */
export interface CacheBinding {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

/** The per-request URL limit for purge-by-URL depends on the plan; 30 fits all of them. */
const PURGE_BATCH = 30

const PurgeResponse = Schema.Struct({
  success: Schema.Boolean,
  errors: Schema.optional(Schema.Array(Schema.Struct({ code: Schema.optional(Schema.Number), message: Schema.String }))),
})

/**
 * Cache API for reads/writes (per data center; only works on a custom domain, not workers.dev).
 * Purge deletes locally and, when CF_ZONE_ID/CF_PURGE_TOKEN are set, purges every data center via the API.
 */
export const make = (cache: CacheBinding, fetchFn: typeof fetch) =>
  Layer.effect(
    Cache,
    Effect.gen(function* () {
      const { cachePurge } = yield* AppConfig

      const purgeZone = (zoneId: string, token: string, urls: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const json = yield* Effect.tryPromise({
            try: (signal) =>
              fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ files: urls }),
                signal,
              }).then((r) => r.json()),
            catch: () => new CacheError({ reason: 'purge-unreachable' }),
          })
          const result = yield* Schema.decodeUnknownEffect(PurgeResponse)(json).pipe(
            Effect.mapError(() => new CacheError({ reason: 'purge-malformed-response' })),
          )
          if (!result.success) {
            return yield* new CacheError({ reason: result.errors?.map((e) => e.message).join('; ') || 'purge-rejected' })
          }
        })

      return Cache.of({
        match: (url) =>
          Effect.tryPromise(() => cache.match(new Request(url))).pipe(
            Effect.map(Option.fromNullishOr),
            Effect.catch((cause) => Effect.logWarning('cache match failed', cause).pipe(Effect.as(Option.none()))),
          ),
        put: (url, response) =>
          Effect.tryPromise(() => cache.put(new Request(url), response)).pipe(
            Effect.catch((cause) => Effect.logWarning('cache put failed', cause)),
          ),
        purge: (urls) =>
          Effect.gen(function* () {
            yield* Effect.forEach(urls, (url) => Effect.tryPromise(() => cache.delete(new Request(url))).pipe(Effect.ignore), {
              discard: true,
            })
            if (Option.isNone(cachePurge) || urls.length === 0) return
            const { zoneId, token } = cachePurge.value
            for (let i = 0; i < urls.length; i += PURGE_BATCH) {
              yield* purgeZone(zoneId, Redacted.value(token), urls.slice(i, i + PURGE_BATCH))
            }
          }),
      })
    }),
  )

export const layer = (cache: CacheBinding) => make(cache, (input, init) => fetch(input, init))
