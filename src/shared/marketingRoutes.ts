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

/** Locales that take a URL prefix (K1): every locale but `en`. */
export const prefixLocales = ['tr', 'de', 'es', 'fr'] as const satisfies ReadonlyArray<Locale>
export type PrefixLocale = (typeof prefixLocales)[number]

const isPrefixLocale = (value: string): value is PrefixLocale => (prefixLocales as ReadonlyArray<string>).includes(value)

/**
 * `params.parse` of the `{-$locale}` route. No segment is `en`; a lowercase prefix locale is that locale. Anything else
 * (`en`, `TR`, `xx`, `app`) returns `false`, which makes the router skip the route instead of matching it, so a locale
 * prefix can never shadow another route. `/en/...` gets its 301 in the Worker (`localeRedirect`).
 */
export const parseLocaleParam = (raw: string | undefined): { readonly locale: PrefixLocale | undefined } | false =>
  raw === undefined ? { locale: undefined } : isPrefixLocale(raw) ? { locale: raw } : false

/** The locale of a URL path: its prefix, or `en` without one. */
export const localeOfPath = (pathname: string): Locale => {
  const first = pathname.split('/')[1] ?? ''
  return isPrefixLocale(first) ? first : 'en'
}

/** The path without its locale prefix (`/tr/blog` → `/blog`, `/tr` → `/`). */
export const unprefixedPath = (pathname: string): string => {
  const locale = localeOfPath(pathname)
  if (locale === 'en') return pathname
  const rest = pathname.slice(locale.length + 1)
  return rest === '' ? '/' : rest
}

/**
 * The language switcher's target (docs/12 §1.2): the same page in `target`, or that locale's home page when the page
 * does not exist there. `alternates` (the page's live locales and their paths, from its head data) wins when given:
 * posts have a slug per locale. Without it, a page with English route parts everywhere maps by prefix; blog, author
 * and RSS pages exist only in `blogLocales` (D9) and a post's slug is unknown, so those go to the blog list or home.
 */
export const switchLocalePath = (pathname: string, target: Locale, alternates?: Readonly<Partial<Record<Locale, string>>>): string => {
  const home = localizedPath(target, '/')
  if (alternates !== undefined) return alternates[target] ?? home
  if (!isMarketingPath(pathname) || UNLOCALIZED.test(pathname)) return home
  const path = unprefixedPath(pathname)
  if (path.startsWith('/blog') || path.startsWith('/authors/')) {
    if (!blogLocales.includes(target)) return home
    return path === '/blog' || path.startsWith('/blog/page/') || path === '/blog/rss.xml' ? localizedPath(target, path) : paths.blogList(target)
  }
  if (path === '/legal/kvkk' && target !== 'tr') return home
  return localizedPath(target, path)
}

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

/** A page sets this response header to keep its response out of the edge cache (e.g. a failed data read). */
export const NO_STORE_HEADER = 'x-vizcad-no-store'

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
const unprefixed = ['/sitemap\\.xml', '/sitemaps/(?:en|tr|de|es|fr)\\.xml', '/robots\\.txt', '/llms\\.txt']

// `en` is never a prefix (`/en/...` is a 301 elsewhere, not a cached page); an uppercase prefix is not a locale.
const MARKETING = new RegExp(
  `^(?:(?:/(?:tr|de|es|fr))?(?:${prefixed.join('|')})|${unprefixed.join('|')})$`,
)

/** Marketing paths that exist once, without a locale (sitemaps, robots, llms). */
const UNLOCALIZED = new RegExp(`^(?:${unprefixed.join('|')})$`)

/** Whether a URL path belongs to the edge-cached marketing space. `/` is; `/tr/` (trailing slash) and `/app` are not. */
export const isMarketingPath = (pathname: string): boolean => (pathname === '/' ? true : pathname !== '' && MARKETING.test(pathname))
