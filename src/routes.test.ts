import { describe, expect, it, vi } from 'vitest'

// The app's route tree reaches Worker-only modules (server routes); importing them is enough here.
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: () => {}, DurableObject: class {} }))

/**
 * The route the real route tree resolves a path to, or `404` when no route matches it completely (the router then only
 * matches layouts "fuzzily" to render its not-found page).
 */
const leaf = async (pathname: string): Promise<string> => {
  const { getRouter } = await import('./router')
  // [branch, rawParams, route]; a fuzzy (not-found) match leaves the unmatched rest in `**`.
  const [, rawParams, route] = getRouter().getMatchedRoutes(pathname)
  return route === undefined || '**' in rawParams ? '404' : route.id
}

const LOCALE_ROUTES = ['/{-$locale}', '/{-$locale}/']

/** Every leaf route of the real route tree (id = full path), generated: a new route is covered without editing this file. */
const leafRoutes = async (): Promise<ReadonlyArray<string>> => {
  const { getRouter } = await import('./router')
  return (Object.values(getRouter().routesById) as ReadonlyArray<{ id: string; children?: unknown }>)
    .filter((route) => route.id !== '__root__')
    .filter((route) => route.children === undefined || (Array.isArray(route.children) ? route.children.length === 0 : Object.keys(route.children as object).length === 0))
    .map((route) => route.id)
}

/** Param values every route accepts (`$page` is a page number, the sitemap locale a real locale, a splat two segments). */
const SAMPLE: Readonly<Record<string, string>> = { page: '2' }
const samplePath = (id: string, locale: '' | 'tr'): string => {
  const path = id
    .replace('{-$locale}', locale)
    .replace('{$locale}', 'en')
    .replace(/\/\$$/, '/a/b')
    .replace(/\$([A-Za-z]+)/g, (_, name: string) => SAMPLE[name] ?? 'x1')
    .replace(/\/+/g, '/')
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

describe('locale prefixes (K1, docs/12 §1.2 and §11 "Rota")', () => {
  it.each([
    ['/', '/{-$locale}/'],
    ['/tr', '/{-$locale}/'],
    ['/de', '/{-$locale}/'],
    ['/es', '/{-$locale}/'],
    ['/fr', '/{-$locale}/'],
  ])('%s is the landing', async (path, route) => {
    expect(await leaf(path)).toBe(route)
  })

  it.each(['/en', '/TR', '/Tr', '/xx', '/tr-TR', '/english', '/xx/blog', '/tr/app', '/tr/sign-in', '/de/unknown'])(
    '%s is not a locale page (404, or a Worker 301 for /en)',
    async (path) => {
      expect(await leaf(path)).toBe('404')
    },
  )

  // Generated from the router's route list (docs/12 §11 "Rota", moved here from 6a): each leaf route's own sample URL
  // resolves to that route, so no route (above all the optional `{-$locale}` prefix) shadows another. Locale routes
  // also resolve with a prefix; no other route does (`/tr/app`, `/tr/api/...` are 404).
  it('every route in the tree resolves to itself, with and without a locale prefix where it has one', async () => {
    const ids = await leafRoutes()
    expect(ids.length).toBeGreaterThan(45)
    const wrong: Array<string> = []
    for (const id of ids) {
      const localized = id.startsWith('/{-$locale}')
      for (const locale of localized ? (['', 'tr'] as const) : ([''] as const)) {
        const path = samplePath(id, locale)
        const got = await leaf(path)
        if (got !== id) wrong.push(`${path} → ${got} (expected ${id})`)
      }
      if (!localized) {
        const prefixed = samplePath(id, '').replace(/^\//, '/tr/').replace(/\/$/, '')
        const got = await leaf(prefixed)
        if (got !== '404') wrong.push(`${prefixed} → ${got} (expected 404)`)
      }
    }
    expect(wrong).toEqual([])
  })

  // The public blog (6b, `en` only: other locales resolve here too and the program answers 404, D9/K14).
  it.each([
    ['/blog', '/{-$locale}/blog/'],
    ['/blog/page/2', '/{-$locale}/blog/page/$page'],
    ['/blog/page/1', '/{-$locale}/blog/page/$page'],
    ['/blog/rss.xml', '/{-$locale}/blog/rss.xml'],
    ['/blog/old-post', '/{-$locale}/blog/$slug'],
    ['/blog/page', '/{-$locale}/blog/$slug'],
    ['/authors/ada', '/{-$locale}/authors/$slug'],
    ['/tr/blog', '/{-$locale}/blog/'],
  ])('%s → %s', async (path, route) => {
    expect(await leaf(path)).toBe(route)
  })

  // Not a page number: `0`, leading zeros and extra segments are 404 (one URL per list page).
  it.each(['/blog/page/0', '/blog/page/01', '/blog/page/x', '/blog/a/b', '/authors/a/b'])('%s is 404', async (path) => {
    expect(await leaf(path)).toBe('404')
  })

  // The legacy JSON endpoints (unauthenticated drafts, docs/12 rule 3) do not exist in the new Worker.
  it.each(['/api/blog', '/api/blog/abc', '/api/blog/slug/x', '/api/blog/upload', '/media/x.png'])('%s is 404', async (path) => {
    expect(await leaf(path)).toBe('404')
  })

  // Legacy URLs (docs/12 §6.9): `/shared/x` and `/author/x` have routes; the rest are Worker 301s before the router
  // (server/edge/legacyRedirect.ts), so the router itself has nothing there.
  it.each(['/shared/abc', '/dashboard', '/file/abc', '/login', '/signup', '/ModelSnap', '/modelsnap', '/author/u1'])(
    'legacy %s is never a locale page',
    async (path) => {
      const route = await leaf(path)
      expect(LOCALE_ROUTES).not.toContain(route)
      expect(route).toBe(path === '/shared/abc' ? '/shared/$token' : path === '/author/u1' ? '/author/$userId' : '404')
    },
  )
})
