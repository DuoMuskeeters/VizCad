import { Effect, Layer, Option, Redacted, Schema } from 'effect'
import { BUILD_ID } from '#/shared/buildId'
import { CacheError } from '../errors'
import { AppConfig } from './AppConfig'
import { Cache, CacheErrorReason, checkHost, checkUrls, PURGE_BATCH } from './Cache'
import { cacheKeyUrl } from './EdgeCache'

const PurgeResponse = Schema.Struct({
  success: Schema.Boolean,
  errors: Schema.optional(Schema.Array(Schema.Struct({ code: Schema.optional(Schema.Number), message: Schema.String }))),
})

/**
 * Cloudflare purge API (docs/12 §7.4). No local `cache.delete`: a zone purge covers every data center including this
 * one, and a local delete costs one subrequest per URL. URLs are sent with this build's `?v=` suffix, the key the hit
 * path stores under (EdgeCache.ts). `fetchFn` and `buildId` are injectable for tests.
 */
export const make = (fetchFn: typeof fetch, buildId: string = BUILD_ID) =>
  Layer.effect(
    Cache,
    Effect.gen(function* () {
      const { cachePurge, siteUrl } = yield* AppConfig

      const call = (zoneId: string, token: string, body: { files: ReadonlyArray<string> } | { hosts: ReadonlyArray<string> }) =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: (signal) =>
              fetchFn(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify(body),
                signal,
              }),
            catch: () => new CacheError({ reason: 'purge-unreachable' }),
          })
          if (response.status === 429) return yield* new CacheError({ reason: CacheErrorReason.rateLimited })
          const json = yield* Effect.tryPromise({ try: () => response.json(), catch: () => new CacheError({ reason: 'purge-malformed-response' }) })
          const result = yield* Schema.decodeUnknownEffect(PurgeResponse)(json).pipe(
            Effect.mapError(() => new CacheError({ reason: 'purge-malformed-response' })),
          )
          if (!result.success) {
            return yield* new CacheError({ reason: result.errors?.map((e) => e.message).join('; ') || 'purge-rejected' })
          }
        })

      const configured = Option.isSome(cachePurge)
      const withConfig = <A>(run: (zoneId: string, token: string) => Effect.Effect<A, CacheError>) =>
        Option.match(cachePurge, {
          onNone: () => Effect.fail(new CacheError({ reason: CacheErrorReason.notConfigured })),
          onSome: ({ zoneId, token }) => run(zoneId, Redacted.value(token)),
        })

      return Cache.of({
        configured,
        purge: (urls) =>
          withConfig((zoneId, token) =>
            Effect.gen(function* () {
              const checked = yield* checkUrls(siteUrl, urls)
              const keys = checked.map((url) => cacheKeyUrl(url.origin, url.pathname, buildId))
              for (let i = 0; i < keys.length; i += PURGE_BATCH) yield* call(zoneId, token, { files: keys.slice(i, i + PURGE_BATCH) })
            }),
          ),
        purgeHost: (hostname) =>
          withConfig((zoneId, token) => checkHost(siteUrl, hostname).pipe(Effect.andThen(call(zoneId, token, { hosts: [hostname] })))),
      })
    }),
  )

export const layer = make((input, init) => fetch(input, init))
