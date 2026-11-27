/**
 * Edge cache hit path for marketing pages (docs/12 §7.1, D4). Runs in src/server.ts before the router on every
 * marketing request, so it is deliberately Effect-free like D1Health (CLAUDE.md exception): a hit loads no Effect, no
 * Drizzle, no router, no D1. Purging lives in the Effect `Cache` service (Cache.ts), which reuses `cacheKeyUrl`.
 *
 * Rules (§7.1): the key is the site host + path + `?v={BUILD_ID}`; a miss renders a sanitized request (same path, no
 * query, no cookies, no headers, GET); only a GET miss with a cacheable response fills the cache; HEAD never does.
 * A cache failure is a miss and never breaks the page.
 */
import { isMarketingPath, NO_STORE_HEADER } from '#/shared/marketingRoutes'

export { NO_STORE_HEADER }

/** The part of the Workers Cache API (`caches.default`) the hit path uses. */
export interface EdgeCacheBinding {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** The edge copy's lifetime: the safety net if a purge is missed. */
export const EDGE_CACHE_CONTROL = 'public, s-maxage=86400'
/** What browsers get, hit or miss: revalidate every time, so a publish shows at once (the ETag makes that cheap). */
export const BROWSER_CACHE_CONTROL = 'public, max-age=0, must-revalidate'
export const CACHE_STATUS_HEADER = 'x-vizcad-cache'

/** `{origin}{path}?v={buildId}`: each build has its own key space, so a deploy never serves HTML pointing at old assets. */
export const cacheKeyUrl = (origin: string, pathname: string, buildId: string): string =>
  `${origin}${pathname}?v=${encodeURIComponent(buildId)}`

/** The cache key, or null when the request is not a cacheable marketing request (method, host, path). */
export const marketingCacheKey = (request: Request, siteUrl: URL, buildId: string): string | null => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  // Another origin (workers.dev, a preview URL, or plain http on the site host) is rendered normally: its HTML may
  // differ (absolute URLs, canonical) and must not be stored under the https key.
  if (url.origin !== siteUrl.origin || !isMarketingPath(url.pathname)) return null
  return cacheKeyUrl(siteUrl.origin, url.pathname, buildId)
}

/**
 * The request a miss renders: same origin and path, GET, `accept: text/html`, nothing else. Query, Cookie,
 * Authorization, Accept-Language and every other header are dropped, so the cached response depends on the path only
 * and no visitor can write a cookie- or query-specific answer into a shared key (cache poisoning).
 */
export const sanitizeForSsr = (request: Request): Request => {
  const url = new URL(request.url)
  return new Request(url.origin + url.pathname, { method: 'GET', headers: { accept: 'text/html' } })
}

/** The response may be stored: 200 or 301, no Set-Cookie, no opt-out header. 404 and 410 are never stored. */
export const isCacheableResponse = (response: Response): boolean =>
  (response.status === 200 || response.status === 301) && !response.headers.has('set-cookie') && !response.headers.has(NO_STORE_HEADER)

/** Whether a miss fills the cache: GET only (a body-less HEAD answer must never fill a key that GETs read). */
export const isCacheable = (request: Request, response: Response): boolean => request.method === 'GET' && isCacheableResponse(response)

/** Weak ETag made on the miss from the build and the put time (base36); the body is not hashed (CPU). */
export const makeEtag = (buildId: string, nowMillis: number): string => `W/"${buildId}.${nowMillis.toString(36)}"`

const opaque = (tag: string) => tag.trim().replace(/^W\//, '')

/** `If-None-Match` (a list, or `*`) matches the entry's ETag, weak comparison. */
export const etagMatches = (ifNoneMatch: string | null, etag: string): boolean => {
  if (ifNoneMatch === null) return false
  const wanted = opaque(etag)
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || opaque(tag) === wanted)
}

const withHeaders = (response: Response, edit: (headers: Headers) => void, body: BodyInit | null = response.body, status = response.status) => {
  const headers = new Headers(response.headers)
  edit(headers)
  return new Response(body, { status, statusText: status === response.status ? response.statusText : '', headers })
}

/** The copy stored at the edge: long `s-maxage` and the ETag; no per-request status header. */
export const edgeCopy = (response: Response, etag: string): Response =>
  withHeaders(response, (h) => {
    h.set('cache-control', EDGE_CACHE_CONTROL)
    h.set('etag', etag)
    h.delete(CACHE_STATUS_HEADER)
  })

/** What the browser gets from a cacheable page: revalidating Cache-Control, the status header, 304 on a matching ETag, no body for HEAD. */
export const browserResponse = (response: Response, request: Request, cache: 'hit' | 'miss'): Response => {
  const edit = (h: Headers) => {
    h.set('cache-control', BROWSER_CACHE_CONTROL)
    h.set(CACHE_STATUS_HEADER, cache)
  }
  const etag = response.headers.get('etag')
  if (etag !== null && etagMatches(request.headers.get('if-none-match'), etag)) {
    return withHeaders(response, (h) => {
      edit(h)
      h.delete('content-length')
      h.delete('content-type')
    }, null, 304)
  }
  return withHeaders(response, edit, request.method === 'HEAD' ? null : response.body)
}

export interface EdgeCacheDeps {
  readonly cache: EdgeCacheBinding
  /** Renders a request through the app (TanStack handler). Receives the sanitized request only. */
  readonly render: (request: Request) => Promise<Response>
  readonly waitUntil: (promise: Promise<unknown>) => void
  readonly buildId: string
  readonly now: () => number
  /** Fixed, payload-free log line (label only). */
  readonly log: (label: string) => void
}

/** Serves one marketing request whose key is `key` (from `marketingCacheKey`). */
export const serveMarketing = (request: Request, key: string, deps: EdgeCacheDeps): Promise<Response> =>
  deps.cache
    .match(new Request(key))
    .then(
      (hit) => hit,
      () => {
        deps.log('edge-cache.match-failed')
        return undefined
      },
    )
    .then((hit) => (hit !== undefined ? browserResponse(hit, request, 'hit') : miss(request, key, deps)))

const miss = (request: Request, key: string, deps: EdgeCacheDeps): Promise<Response> =>
  deps.render(sanitizeForSsr(request)).then((rendered) => {
    if (!isCacheableResponse(rendered)) {
      // Not storable (404, Set-Cookie, opt-out): passed through with its own Cache-Control.
      return withHeaders(rendered, (h) => h.set(CACHE_STATUS_HEADER, 'miss'), request.method === 'HEAD' ? null : rendered.body)
    }
    if (!isCacheable(request, rendered)) return browserResponse(rendered, request, 'miss')
    const stored = edgeCopy(rendered, makeEtag(deps.buildId, deps.now()))
    const copy = stored.clone()
    deps.waitUntil(
      Promise.resolve()
        .then(() => deps.cache.put(new Request(key), copy))
        .then(
          () => undefined,
          () => deps.log('edge-cache.put-failed'),
        ),
    )
    return browserResponse(stored, request, 'miss')
  })
