/**
 * Worker entry. TanStack Start's default handler plus the Durable Object classes the Worker exports
 * (Cloudflare requires them from the `main` module) and the cron handler. wrangler.jsonc `main` points here.
 *
 * Marketing pages go through the edge cache first (docs/12 §7.1, services/EdgeCache.ts): a hit is answered here,
 * before the router, without Effect or D1; a miss renders a sanitized request. Everything else goes straight to the
 * handler. Keep this module small: it is evaluated on every request.
 */
import handler from '@tanstack/react-start/server-entry'
import { type EdgeCacheBinding, marketingCacheKey, serveMarketing } from '#/server/services/EdgeCache'
import { BUILD_ID } from '#/shared/buildId'

export { RateLimiter } from '#/server/durable/RateLimiter'

// The Workers `caches.default` (the generated CacheStorage type has no `default`). No code is emitted.
declare const caches: { readonly default: EdgeCacheBinding }

/** SITE_URL parsed once per isolate (and again only if the env value changes). Unparseable: no edge cache. */
let site: { readonly raw: string; readonly url: URL | null } | undefined
const siteUrlOf = (raw: string) => {
  if (site?.raw !== raw) site = { raw, url: URL.canParse(raw) ? new URL(raw) : null }
  return site.url
}

export default {
  fetch: (request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> => {
    const siteUrl = siteUrlOf(env.SITE_URL)
    const key = siteUrl === null ? null : marketingCacheKey(request, siteUrl, BUILD_ID)
    if (key === null) return Promise.resolve(handler.fetch(request))
    return serveMarketing(request, key, {
      cache: caches.default,
      render: (sanitized) => Promise.resolve(handler.fetch(sanitized)),
      waitUntil: (promise) => ctx.waitUntil(promise),
      buildId: BUILD_ID,
      now: () => Date.now(),
      // A fixed label only (docs/12 §7.1: a cache failure is logged by tag and never breaks the page).
      log: (label) => console.warn(label),
    })
  },
  scheduled: (controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) => {
    // Loaded on demand: the server code (Effect, Drizzle, services) must not be evaluated on every request.
    ctx.waitUntil(import('#/server/http/entry.cron').then(({ handleScheduled }) => handleScheduled(controller.cron, env)))
  },
}
