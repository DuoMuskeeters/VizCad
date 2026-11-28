import { createServerFn } from '@tanstack/react-start'
import type { Locale } from '#/i18n/locales'
import { NO_STORE_HEADER } from '#/shared/marketingRoutes'

/**
 * Server functions of the public blog pages. Server-only modules load inside the handlers (dynamic `import()`), so
 * Effect, Drizzle and the programs never reach the client bundle. Results are plain values (entry.cms `PageResult`):
 * the route turns 404 into `notFound()`, 410 into a "gone" page with status 410, and 500 into an error page with
 * status 500 (`markStatus`) that is never cached (`x-vizcad-no-store`, and the edge cache stores 200/301 only).
 */

/**
 * The inputs' types for callers. Nothing is checked here (this module reaches the client, so no Effect): whatever
 * reaches the RPC endpoint is decoded with Schema on the server (http/blogPages.ts) and is a 404 when invalid.
 */
const pageInput = (input: { readonly locale: Locale; readonly page: number }) => input
const slugInput = (input: { readonly locale: Locale; readonly slug: string }) => input

/**
 * The status a failed result sets on the SSR response: 410 (archived post) and 500 (D1, config). The router itself
 * only knows 200 and 404, and 404 is the route's `notFound()`, so it sets nothing here. Without this a server failure
 * would answer 200 "Something broke".
 */
export const failureStatus = (result: { readonly ok: boolean; readonly status?: number }): number | null =>
  !result.ok && result.status !== undefined && result.status !== 404 ? result.status : null

/** Sets `failureStatus` on the SSR response from inside the server function. */
export const markStatus = async <R extends { readonly ok: boolean; readonly status?: number }>(result: R): Promise<R> => {
  const status = failureStatus(result)
  if (status !== null) {
    const { setResponseStatus } = await import('@tanstack/react-start/server')
    setResponseStatus(status)
  }
  return result
}

export const loadBlogList = createServerFn({ method: 'GET' })
  .validator(pageInput)
  .handler(async ({ data }) => {
    const [{ env }, entry] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
    return markStatus(await entry.loadBlogList(env, data))
  })

export const loadPost = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const [{ env }, entry] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
    return markStatus(await entry.loadPost(env, data))
  })

export const loadAuthor = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const [{ env }, entry] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
    return markStatus(await entry.loadAuthor(env, data))
  })

/** Only a 200 page may be stored at the edge for a day. A 404 is never stored anyway (isCacheable); 410 and 500 opt out. */
export const pageHeaders = (result: { readonly ok: boolean } | undefined): Record<string, string> =>
  result?.ok === true ? {} : { [NO_STORE_HEADER]: '1', 'cache-control': 'no-store' }
