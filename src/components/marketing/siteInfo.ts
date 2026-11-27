import { createServerFn } from '@tanstack/react-start'
import { NO_STORE_HEADER } from '#/shared/marketingRoutes'

/**
 * The site origin a marketing page's head needs (canonical, hreflang, JSON-LD), from AppConfig on the server. Page
 * routes call it in their loader; server-only modules load inside the handler, so they never reach the client bundle.
 */
export const loadSite = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ env }, { loadSiteInfo }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
  return loadSiteInfo(env)
})

/** Without the site origin the page has no canonical: it must not be cached for a day. */
export const siteHeaders = (site: { readonly ok: boolean } | undefined): Record<string, string> =>
  site?.ok === true ? {} : { [NO_STORE_HEADER]: '1', 'cache-control': 'no-store' }
