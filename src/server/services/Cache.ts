import { Context, Effect, Layer, Option, Ref } from 'effect'
import type { CacheError } from '../errors'

/**
 * Edge cache for SSR marketing and blog pages (D4): pages are rendered in the Worker, kept in the
 * Cloudflare cache, and purged by URL when the admin publishes. Reads and writes never fail (a broken
 * cache must not break a page; it degrades to a miss); purge fails with CacheError so publish can report it.
 * Live layer: Cache.live.ts. Test layer: `memory` (also provides CachePurges).
 */
export class Cache extends Context.Service<
  Cache,
  {
    readonly match: (url: string) => Effect.Effect<Option.Option<Response>>
    readonly put: (url: string, response: Response) => Effect.Effect<void>
    readonly purge: (urls: ReadonlyArray<string>) => Effect.Effect<void, CacheError>
  }
>()('vizcad/Cache') {}

/** Every URL list passed to `purge` by the in-memory layer, in order. */
export class CachePurges extends Context.Service<CachePurges, Ref.Ref<ReadonlyArray<ReadonlyArray<string>>>>()('vizcad/test/CachePurges') {}

interface Stored {
  readonly status: number
  readonly headers: ReadonlyArray<[string, string]>
  readonly body: ArrayBuffer
}

export const memory = Layer.effect(
  Cache,
  Effect.gen(function* () {
    const purges = yield* CachePurges
    const entries = yield* Ref.make(new Map<string, Stored>())
    return Cache.of({
      match: (url) =>
        Ref.get(entries).pipe(
          Effect.map((m) =>
            Option.fromNullishOr(m.get(url)).pipe(
              Option.map((s) => new Response(s.body.slice(0), { status: s.status, headers: [...s.headers] })),
            ),
          ),
        ),
      put: (url, response) =>
        Effect.promise(() => response.arrayBuffer()).pipe(
          Effect.flatMap((body) =>
            Ref.update(entries, (m) => new Map(m).set(url, { status: response.status, headers: [...response.headers], body })),
          ),
        ),
      purge: (urls) =>
        Ref.update(entries, (m) => {
          const next = new Map(m)
          for (const url of urls) next.delete(url)
          return next
        }).pipe(Effect.andThen(Ref.update(purges, (all) => [...all, urls]))),
    })
  }),
).pipe(Layer.provideMerge(Layer.effect(CachePurges, Ref.make<ReadonlyArray<ReadonlyArray<string>>>([]))))
