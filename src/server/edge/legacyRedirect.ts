/**
 * 301s for URLs of the legacy app (docs/12 §6.9), answered in the Worker before the edge cache and the router,
 * Effect-free (no D1). The target is a fixed path built from the match; nothing else from the request is copied, and the
 * query is always dropped (legacy invite links carried `?invite=…` to `/signup`; pending invites are the cutover's job,
 * docs/08). App and sign-in targets are `private, no-store` and never enter the marketing cache.
 *
 * | Legacy               | New                 |
 * |----------------------|---------------------|
 * | `/dashboard`         | `/app`              |
 * | `/file/{id}`         | `/app/files/{id}`   |
 * | `/login`             | `/sign-in`          |
 * | `/signup`            | `/sign-up`          |
 * | `/ModelSnap`, `/modelsnap` | `/` (K12, the studio export tab was not ported, D15) |
 *
 * `/file/{id}` takes exactly one segment of `[A-Za-z0-9_-]{1,64}`; anything else (`/file/a/b`, `/file/`) is left to
 * the router's 404. `/author/{userId}` needs D1 (the author's slug) and is a route (routes/author/$userId.ts).
 */
const APP = { 'cache-control': 'private, no-store' }
const MARKETING = { 'cache-control': 'public, max-age=86400' }

/** The redirect target path and its cache header, or null. Exported for tests. */
export const legacyRedirectTarget = (pathname: string): { readonly path: string; readonly headers: Record<string, string> } | null => {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  switch (path) {
    case '/dashboard':
      return { path: '/app', headers: APP }
    case '/login':
      return { path: '/sign-in', headers: APP }
    case '/signup':
      return { path: '/sign-up', headers: APP }
    case '/ModelSnap':
    case '/modelsnap':
      return { path: '/', headers: MARKETING }
  }
  const file = /^\/file\/([A-Za-z0-9_-]{1,64})$/.exec(path)
  return file === null ? null : { path: `/app/files/${file[1]}`, headers: APP }
}

/** 301 for GET and HEAD only; other methods go on to the router. */
export const legacyRedirect = (request: Request): Response | null => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  const target = legacyRedirectTarget(url.pathname)
  if (target === null) return null
  return new Response(null, { status: 301, headers: { ...target.headers, location: `${url.origin}${target.path}` } })
}
