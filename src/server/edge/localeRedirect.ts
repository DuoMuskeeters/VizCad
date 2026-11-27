/**
 * URL normalization 301s answered in the Worker before the edge cache and the router (docs/12 §1.2), Effect-free:
 * `/en` and `/en/...` → the same path without the prefix (`en` never takes one, K1), and a marketing path with a
 * trailing slash → the path without it (`/tr/` → `/tr`, `/blog/` → `/blog`). The query is kept: these answers never
 * enter the edge cache, so they may depend on it. Uppercase prefixes (`/EN`, `/TR`) are not locales and stay 404.
 */
import { isMarketingPath } from '#/shared/marketingRoutes'

/** The normalized path and query, or null when the URL needs no redirect. */
export const localeRedirectTarget = (url: URL): string | null => {
  let path = url.pathname
  if (path === '/en' || path.startsWith('/en/')) path = path.slice(3) === '' ? '/' : path.slice(3)
  if (path.length > 1 && path.endsWith('/')) {
    const trimmed = path.replace(/\/+$/, '') || '/'
    if (isMarketingPath(trimmed)) path = trimmed
  }
  return path === url.pathname ? null : `${path}${url.search}`
}

/** 301 for GET and HEAD only; other methods go on to the router (and its 404 or 405). */
export const localeRedirect = (request: Request): Response | null => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  const target = localeRedirectTarget(url)
  if (target === null) return null
  return new Response(null, { status: 301, headers: { location: new URL(target, url).href, 'cache-control': 'public, max-age=86400' } })
}
