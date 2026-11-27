import { describe, expect, it } from 'vitest'
import { isMarketingPath, localeOfPath, localizedPath, parseLocaleParam, paths, switchLocalePath, unprefixedPath } from './marketingRoutes'

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

describe('locale prefixes', () => {
  it('parseLocaleParam accepts only the four lowercase prefixes; anything else makes the route not match', () => {
    expect(parseLocaleParam(undefined)).toEqual({ locale: undefined })
    for (const locale of ['tr', 'de', 'es', 'fr'] as const) expect(parseLocaleParam(locale)).toEqual({ locale })
    for (const raw of ['en', 'TR', 'Tr', 'xx', 'tr-TR', 'app', 's', 'api', '', 'english']) expect(parseLocaleParam(raw), raw).toBe(false)
  })

  it('localeOfPath and unprefixedPath', () => {
    expect([localeOfPath('/'), unprefixedPath('/')]).toEqual(['en', '/'])
    expect([localeOfPath('/tr'), unprefixedPath('/tr')]).toEqual(['tr', '/'])
    expect([localeOfPath('/de/blog/x'), unprefixedPath('/de/blog/x')]).toEqual(['de', '/blog/x'])
    expect([localeOfPath('/blog'), unprefixedPath('/blog')]).toEqual(['en', '/blog'])
    expect([localeOfPath('/TR/blog'), unprefixedPath('/TR/blog')]).toEqual(['en', '/TR/blog'])
    expect([localeOfPath('/trx'), unprefixedPath('/trx')]).toEqual(['en', '/trx'])
  })
})

describe('switchLocalePath (language switcher)', () => {
  it('same page in the other locale for pages with English route parts', () => {
    expect(switchLocalePath('/', 'tr')).toBe('/tr')
    expect(switchLocalePath('/tr', 'en')).toBe('/')
    expect(switchLocalePath('/tr', 'fr')).toBe('/fr')
    expect(switchLocalePath('/pricing', 'de')).toBe('/de/pricing')
    expect(switchLocalePath('/es/faq', 'en')).toBe('/faq')
    expect(switchLocalePath('/legal/terms', 'tr')).toBe('/tr/legal/terms')
    expect(switchLocalePath('/fr/legal/privacy/v/2', 'es')).toBe('/es/legal/privacy/v/2')
  })

  it('blog, author and RSS pages exist only in blogLocales (D9): other locales go home; a post goes to the blog list', () => {
    expect(switchLocalePath('/blog', 'tr')).toBe('/tr')
    expect(switchLocalePath('/blog/my-post', 'de')).toBe('/de')
    expect(switchLocalePath('/authors/ada', 'fr')).toBe('/fr')
    expect(switchLocalePath('/blog/rss.xml', 'es')).toBe('/es')
    expect(switchLocalePath('/blog/page/2', 'en')).toBe('/blog/page/2')
    expect(switchLocalePath('/blog/my-post', 'en')).toBe('/blog')
  })

  it('KVKK exists only in tr; unlocalized and non-marketing paths go to the locale home', () => {
    expect(switchLocalePath('/tr/legal/kvkk', 'en')).toBe('/')
    expect(switchLocalePath('/tr/legal/kvkk', 'tr')).toBe('/tr/legal/kvkk')
    expect(switchLocalePath('/dev/cms-probe', 'tr')).toBe('/tr')
    expect(switchLocalePath('/sitemap.xml', 'de')).toBe('/de')
    expect(switchLocalePath('/app', 'fr')).toBe('/fr')
  })

  it('the page alternates win when given (a post has a slug per locale); a missing locale goes home', () => {
    const alternates = { en: '/blog/my-post', tr: '/tr/blog/benim-yazim' }
    expect(switchLocalePath('/blog/my-post', 'tr', alternates)).toBe('/tr/blog/benim-yazim')
    expect(switchLocalePath('/tr/blog/benim-yazim', 'en', alternates)).toBe('/blog/my-post')
    expect(switchLocalePath('/blog/my-post', 'de', alternates)).toBe('/de')
  })

  it('every target is itself a marketing path', () => {
    for (const from of ['/', '/tr', '/pricing', '/blog', '/blog/x', '/tr/legal/kvkk', '/dev/cms-probe']) {
      for (const to of ['en', 'tr', 'de', 'es', 'fr'] as const) expect(isMarketingPath(switchLocalePath(from, to)), `${from} → ${to}`).toBe(true)
    }
  })
})
