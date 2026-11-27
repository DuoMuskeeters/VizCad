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
  ])('%s → %s', async (path, route) => {
    expect(await leaf(path)).toBe(route)
  })

  // Legacy URLs keep their own handling: `/shared/x` its 302, the rest a 404 today and a Worker 301 in 6b (docs/12 §6.9).
  it.each(['/shared/abc', '/dashboard', '/file/abc', '/login', '/signup', '/ModelSnap', '/modelsnap', '/author/u1', '/blog', '/blog/old-post'])(
    'legacy %s is never a locale page',
    async (path) => {
      const route = await leaf(path)
      expect(LOCALE_ROUTES).not.toContain(route)
      expect(route).toBe(path === '/shared/abc' ? '/shared/$token' : '404')
    },
  )
})
