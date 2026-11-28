import { Effect, type Layer } from 'effect'
import type { AppError } from '../errors'
import { legacyAuthorPath } from '../programs/cms/blog'
import type { Db } from '../services/Db'
import { handle, type RequestMeta } from './respond'

/**
 * `GET /author/{userId}` → 301 to `/authors/{slug}` or `/blog` (docs/12 §6.9). An id that is not one safe segment goes
 * to `/blog` without a query. Not cached: the slug can change.
 */
export const legacyAuthorResponse = (request: Request, layer: Layer.Layer<Db, AppError>, meta: RequestMeta) =>
  handle(
    Effect.gen(function* () {
      const url = new URL(request.url)
      const match = /^\/author\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)
      const path = match?.[1] === undefined ? '/blog' : yield* legacyAuthorPath(match[1])
      return new Response(null, { status: 301, headers: { location: `${url.origin}${path}`, 'cache-control': 'private, no-store' } })
    }),
    layer,
    meta,
  )
