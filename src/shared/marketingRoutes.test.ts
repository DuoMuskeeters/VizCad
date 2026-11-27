import { describe, expect, it } from 'vitest'
import { isMarketingPath, localizedPath, paths } from './marketingRoutes'

describe('marketing routes', () => {
  it.each([
    '/', '/tr', '/de', '/blog', '/blog/page/2', '/blog/rss.xml', '/blog/my-post', '/tr/blog/benim-yazim', '/authors/ada',
    '/pricing', '/fr/faq', '/contact', '/legal/privacy', '/legal/terms/v/2', '/tr/legal/kvkk',
    '/sitemap.xml', '/sitemaps/en.xml', '/sitemaps/tr.xml', '/robots.txt', '/llms.txt', '/dev/cms-probe',
  ])('%s is a marketing page', (path) => expect(isMarketingPath(path)).toBe(true))

  it.each([
    '', '/tr/', '/blog/', '/en', '/en/blog', '/TR', '/xx/blog', '/app', '/app/files/1', '/s/token', '/sign-in', '/api/health',
    '/api/blog/image/blog%2Fa.png', '/blog/a/b', '/blog/page/0', '/admin/cms/posts', '/dev/ui', '/sitemaps/xx.xml', '/tr/sitemap.xml',
    '/shared/abc', '/onboarding',
  ])('%s is not', (path) => expect(isMarketingPath(path)).toBe(false))

  it('builds localized paths: en has no prefix, the landing has no trailing slash', () => {
    expect(localizedPath('en', '/')).toBe('/')
    expect(localizedPath('tr', '/')).toBe('/tr')
    expect(paths.blogList('en')).toBe('/blog')
    expect(paths.blogList('tr', 3)).toBe('/tr/blog/page/3')
    expect(paths.post('de', 'x')).toBe('/de/blog/x')
    expect(paths.sitemap('fr')).toBe('/sitemaps/fr.xml')
  })

  it('every path the builders produce is a marketing path (purge and cache key agree)', () => {
    for (const path of [paths.blogList('en'), paths.blogList('en', 4), paths.post('en', 'a-b'), paths.rss('en'), paths.author('tr', 'ada'),
      paths.legal('tr', 'kvkk'), paths.page('es', 'pricing'), paths.page('tr', 'landing'), paths.sitemapIndex(), paths.sitemap('de'), paths.llms(), paths.robots()]) {
      expect(isMarketingPath(path), path).toBe(true)
    }
  })
})
