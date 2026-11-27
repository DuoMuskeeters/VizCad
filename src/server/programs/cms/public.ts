import { Effect } from 'effect'
import { LOCALE_NAMES, LOCALES, type Locale } from '#/i18n/locales'
import { blogLocales, pagePaths, paths } from '#/shared/marketingRoutes'
import { liveLocales, sameAlternates, type Alternates } from '#/shared/seo/head'
import { buildLlmsTxt } from '../../cms/llms'
import { buildRobotsTxt } from '../../cms/robots'
import { buildRss } from '../../cms/rss'
import { buildSitemap, buildSitemapIndex, type SitemapEntry } from '../../cms/sitemap'
import { ResourceUnavailable } from '../../errors'
import { AppConfig } from '../../services/AppConfig'
import { fromUnixSeconds } from '../../time'
import { latestPosts, RSS_ITEMS, type SitemapPost, sitemapPosts } from './blog'

/**
 * Public SEO files (docs/12 §3.1, §6.4–§6.7), served from the edge cache like marketing pages.
 *
 * Sitemap locales follow `blogLocales` (D9/K14, today `['en']`); 6d adds every locale with a live page. Indexable
 * URLs (§6.4): the landing, the blog list (page 1 only; `/blog/page/2` is never listed), public posts and authors
 * with a public post. Each URL lists its live locales plus `x-default`.
 */
export const sitemapLocales: ReadonlyArray<Locale> = LOCALES.filter((locale) => blogLocales.includes(locale))

/** Single-URL pages that are indexable per locale: only the landing, only in `en` until 6d makes pages live. */
const livePages: ReadonlyArray<{ readonly path: string; readonly live: ReadonlyArray<Locale> }> = [{ path: pagePaths.landing, live: ['en'] }]

export const BLOG_NAME = 'VizCad Blog'
export const BLOG_DESCRIPTION = 'Guides and notes on viewing, sharing and reviewing 3D CAD files.'
/** `llms.summary` site text default (6d makes it editable). Only what the product does today (03 §6). */
export const LLMS_SUMMARY =
  'VizCad is a web app for teams to upload, view, share and comment on 3D CAD files (STEP, IGES, STL and more) in the browser, with workspaces, roles and share links.'

export const robotsTxt = Effect.gen(function* () {
  const { appEnv, siteUrl } = yield* AppConfig
  return buildRobotsTxt({ appEnv, siteUrl })
})

export const sitemapIndexXml = Effect.gen(function* () {
  const { siteUrl } = yield* AppConfig
  return buildSitemapIndex(sitemapLocales.map((locale) => ({ loc: `${siteUrl.origin}${paths.sitemap(locale)}` })))
})

const entryFor = (origin: string, locale: Locale, alternates: Alternates, lastmod?: Date): SitemapEntry => {
  const href = (l: Locale) => `${origin}${alternates[l] ?? alternates.en}`
  return {
    loc: href(locale),
    ...(lastmod === undefined ? {} : { lastmod }),
    alternates: [...liveLocales(alternates).map((l) => ({ hreflang: l, href: href(l) })), { hreflang: 'x-default', href: href('en') }],
  }
}

const newest = (posts: ReadonlyArray<SitemapPost>) => (posts.length === 0 ? undefined : fromUnixSeconds(Math.max(...posts.map((p) => p.updatedAt))))

/** One locale's sitemap; 404 for a locale without one (not in the index, never cached). One D1 query. */
export const sitemapXml = Effect.fn('sitemapXml')(function* (locale: Locale) {
  if (!sitemapLocales.includes(locale)) return yield* new ResourceUnavailable()
  const { siteUrl } = yield* AppConfig
  const origin = siteUrl.origin
  const pages = livePages.flatMap((page) => (page.live.includes(locale) ? [entryFor(origin, locale, sameAlternates(page.path, page.live))] : []))
  if (!blogLocales.includes(locale)) return buildSitemap(pages)

  const rows = yield* sitemapPosts(blogLocales)
  const byPost = new Map<string, Array<SitemapPost>>()
  for (const row of rows) byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row])
  const here = rows.filter((row) => row.locale === locale)

  const blogList = entryFor(origin, locale, sameAlternates('/blog', blogLocales), newest(here))
  const posts = here.map((row) => {
    const alternates: Partial<Record<Locale, string>> = {}
    for (const t of byPost.get(row.postId) ?? []) alternates[t.locale] = paths.post(t.locale, t.slug)
    return entryFor(origin, locale, { ...alternates, en: alternates.en ?? paths.post(locale, row.slug) }, fromUnixSeconds(row.updatedAt))
  })
  const authorSlugs = [...new Set(here.flatMap((row) => (row.authorSlug === null ? [] : [row.authorSlug])))]
  const authors = authorSlugs.map((slug) => {
    const live = blogLocales.filter((l) => rows.some((row) => row.locale === l && row.authorSlug === slug))
    return entryFor(origin, locale, sameAlternates(`/authors/${slug}`, live), newest(here.filter((row) => row.authorSlug === slug)))
  })
  return buildSitemap([...pages, blogList, ...posts, ...authors])
})

/** `/blog/rss.xml` (and `/{locale}/blog/rss.xml` once the locale is in blogLocales): the 20 newest posts. */
export const rssXml = Effect.fn('rssXml')(function* (locale: Locale) {
  if (!blogLocales.includes(locale)) return yield* new ResourceUnavailable()
  const { siteUrl } = yield* AppConfig
  const posts = yield* latestPosts(locale, RSS_ITEMS)
  return buildRss({
    title: BLOG_NAME,
    description: BLOG_DESCRIPTION,
    link: `${siteUrl.origin}${paths.blogList(locale)}`,
    self: `${siteUrl.origin}${paths.rss(locale)}`,
    locale,
    items: posts.map((post) => ({
      title: post.title,
      url: `${siteUrl.origin}${paths.post(locale, post.slug)}`,
      excerpt: post.excerpt,
      category: post.category,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    })),
  })
})

export const LLMS_BLOG_POSTS = 30

/** `/llms.txt` (§6.6): English, the pages that exist, the 30 newest `en` posts, the locale home pages. */
export const llmsTxt = Effect.gen(function* () {
  const { siteUrl } = yield* AppConfig
  const origin = siteUrl.origin
  const posts = yield* latestPosts('en', LLMS_BLOG_POSTS)
  return buildLlmsTxt({
    summary: LLMS_SUMMARY,
    product: [
      { title: 'VizCad', url: `${origin}/`, description: 'What VizCad is and who it is for' },
      { title: BLOG_NAME, url: `${origin}${paths.blogList('en')}`, description: BLOG_DESCRIPTION },
    ],
    blog: posts.map((post) => ({ title: post.title, url: `${origin}${paths.post('en', post.slug)}`, description: post.excerpt })),
    languages: LOCALES.map((locale) => ({ title: LOCALE_NAMES[locale], url: `${origin}${paths.page(locale, 'landing')}` })),
  })
})
