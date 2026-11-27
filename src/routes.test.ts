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

  // Static app, auth, API and token routes win over the optional prefix: none of them may resolve to a locale page.
  it.each([
    ['/app', '/app/'],
    ['/app/files/f1', '/app/files/$id'],
    ['/app/projects/p1', '/app/projects/$id'],
    ['/app/settings', '/app/settings'],
    ['/s/token123', '/s/$token/'],
    ['/s/token123/scene', '/s/$token/scene'],
    ['/sign-in', '/sign-in'],
    ['/sign-up', '/sign-up'],
    ['/verify-email', '/verify-email'],
    ['/email-verified', '/email-verified'],
    ['/forgot-password', '/forgot-password'],
    ['/reset-password', '/reset-password'],
    ['/onboarding', '/onboarding'],
    ['/invite/abc', '/invite/$id'],
    ['/guest-invite/abc', '/guest-invite/$token'],
    ['/api/health', '/api/health'],
    ['/api/app/listFiles', '/api/app/$'],
    ['/api/cms/listPurges', '/api/cms/$'],
    ['/api/auth/get-session', '/api/auth/$'],
    ['/api/s/x', '/api/s/$'],
    ['/api/files/f1/content', '/api/files/$fileId/content'],
    ['/dev/cms-probe', '/dev/cms-probe'],
    ['/robots.txt', '/robots.txt'],
    ['/sitemap.xml', '/sitemap.xml'],
    ['/sitemaps/en.xml', '/sitemaps/{$locale}.xml'],
    ['/llms.txt', '/llms.txt'],
    ['/api/blog/image/blog%2Fa.png', '/api/blog/image/$key'],
  ])('%s → %s', async (path, route) => {
    expect(await leaf(path)).toBe(route)
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

  // Legacy URLs keep their own handling: `/shared/x` its 302, the rest a 404 today and a Worker 301 in 6b-2 (docs/12 §6.9).
  it.each(['/shared/abc', '/dashboard', '/file/abc', '/login', '/signup', '/ModelSnap', '/modelsnap', '/author/u1'])(
    'legacy %s is never a locale page',
    async (path) => {
      const route = await leaf(path)
      expect(LOCALE_ROUTES).not.toContain(route)
      expect(route).toBe(path === '/shared/abc' ? '/shared/$token' : '404')
    },
  )
})
