import { createServerFn } from '@tanstack/react-start'
import { LOCALES, type Locale } from '#/i18n/locales'
import { NO_STORE_HEADER } from '#/shared/marketingRoutes'

/**
 * Server functions of the public blog pages. Server-only modules load inside the handlers (dynamic `import()`), so
 * Effect, Drizzle and the programs never reach the client bundle. Results are plain values (entry.cms `PageResult`):
 * the route turns 404 into `notFound()`, 410 into a "gone" page with status 410, and 500 into an error page with
 * status 500 (`markStatus`) that is never cached (`x-vizcad-no-store`, and the edge cache stores 200/301 only).
 */
const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as ReadonlyArray<string>).includes(value)

/** Route params are already parsed by the router; this rejects anything else that reaches the RPC endpoint. */
const slugInput = (input: unknown): { readonly locale: Locale; readonly slug: string } => {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { locale, slug } = value
  if (!isLocale(locale) || typeof slug !== 'string' || slug.length === 0 || slug.length > 200) throw new Error('invalid input')
  return { locale, slug }
}

const pageInput = (input: unknown): { readonly locale: Locale; readonly page: number } => {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { locale, page } = value
  if (!isLocale(locale) || typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 10_000) throw new Error('invalid input')
  return { locale, page }
}

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
    return markStatus(await entry.loadBlogList(env, data.locale, data.page))
  })

export const loadPost = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const [{ env }, entry] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
    return markStatus(await entry.loadPost(env, data.locale, data.slug))
  })

export const loadAuthor = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const [{ env }, entry] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
    return markStatus(await entry.loadAuthor(env, data.locale, data.slug))
  })

/** Only a 200 page may be stored at the edge for a day. A 404 is never stored anyway (isCacheable); 410 and 500 opt out. */
export const pageHeaders = (result: { readonly ok: boolean } | undefined): Record<string, string> =>
  result?.ok === true ? {} : { [NO_STORE_HEADER]: '1', 'cache-control': 'no-store' }
