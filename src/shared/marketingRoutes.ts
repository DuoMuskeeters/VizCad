/**
 * The marketing (edge-cached) URL space, in one list (docs/12 §7.1). Both the cache key (`marketingCacheKey`, read on
 * every request in src/server.ts before the router) and the purge list (`affectedUrls`) use it, so a page that is
 * cached is also purged. Plain TypeScript: no Effect, no React, safe in the Worker entry chunk.
 */
import { LOCALES, type Locale } from '#/i18n/locales'

export { LOCALES, type Locale }

/** Locales with blog, author and RSS routes (D9, K14). Other locales answer 404 there and are never purged. */
export const blogLocales: ReadonlyArray<Locale> = ['en']

/** Pages whose texts and SEO come from the CMS (`page_seo.pageKey`, `site_texts` groups). */
export const pageKeys = ['landing', 'pricing', 'faq', 'contact', 'blog', 'legal'] as const
export type PageKey = (typeof pageKeys)[number]

/** Single-URL pages and their unprefixed path. `blog` and `legal` are page groups (many URLs), see affectedUrls. */
export const pagePaths = {
  landing: '/',
  pricing: '/pricing',
  faq: '/faq',
  contact: '/contact',
} as const satisfies Partial<Record<PageKey, string>>

export const legalKinds = ['privacy', 'terms', 'cookies', 'subprocessors', 'kvkk'] as const
export type LegalKind = (typeof legalKinds)[number]

/** `en` has no prefix (`/blog/x`), the others do (`/tr/blog/x`). `/` becomes `/tr`, never `/tr/`. */
export const localizedPath = (locale: Locale, path: string): string =>
  locale === 'en' ? path : path === '/' ? `/${locale}` : `/${locale}${path}`

export const paths = {
  blogList: (locale: Locale, page = 1) => localizedPath(locale, page <= 1 ? '/blog' : `/blog/page/${page}`),
  post: (locale: Locale, slug: string) => localizedPath(locale, `/blog/${slug}`),
  rss: (locale: Locale) => localizedPath(locale, '/blog/rss.xml'),
  author: (locale: Locale, slug: string) => localizedPath(locale, `/authors/${slug}`),
  legal: (locale: Locale, kind: LegalKind) => localizedPath(locale, `/legal/${kind}`),
  page: (locale: Locale, key: keyof typeof pagePaths) => localizedPath(locale, pagePaths[key]),
  sitemapIndex: () => '/sitemap.xml',
  sitemap: (locale: Locale) => `/sitemaps/${locale}.xml`,
  llms: () => '/llms.txt',
  robots: () => '/robots.txt',
} as const

/** Temporary CPU-gate page (docs/12 §7.5, staging only, removed in 6b). Cached like a marketing page so hit/miss can be measured. */
export const CMS_PROBE_PATH = '/dev/cms-probe'

const segment = '[^/]+'
const prefixed = [
  '', // landing: `/` (en) or `/tr`
  '/blog',
  `/blog/page/[1-9][0-9]*`,
  '/blog/rss\\.xml',
  `/blog/${segment}`,
  `/authors/${segment}`,
  '/pricing',
  '/faq',
  '/contact',
  `/legal/${segment}`,
  `/legal/${segment}/v/[1-9][0-9]*`,
]
const unprefixed = ['/sitemap\\.xml', '/sitemaps/(?:en|tr|de|es|fr)\\.xml', '/robots\\.txt', '/llms\\.txt', CMS_PROBE_PATH]

// `en` is never a prefix (`/en/...` is a 301 elsewhere, not a cached page); an uppercase prefix is not a locale.
const MARKETING = new RegExp(
  `^(?:(?:/(?:tr|de|es|fr))?(?:${prefixed.join('|')})|${unprefixed.join('|')})$`,
)

/** Whether a URL path belongs to the edge-cached marketing space. `/` is; `/tr/` (trailing slash) and `/app` are not. */
export const isMarketingPath = (pathname: string): boolean => (pathname === '/' ? true : pathname !== '' && MARKETING.test(pathname))
