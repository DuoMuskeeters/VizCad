import { Effect } from 'effect'
import { LOCALES, type Locale } from '#/i18n/locales'
import { blogLocales, pagePaths, paths } from '#/shared/marketingRoutes'
import { liveLocales, sameAlternates } from '#/shared/seo/head'
import { buildRobotsTxt } from '../../cms/robots'
import { buildSitemap, buildSitemapIndex, type SitemapEntry } from '../../cms/sitemap'
import { ResourceUnavailable } from '../../errors'
import { AppConfig } from '../../services/AppConfig'

/**
 * Public SEO files (docs/12 §3.1, §6.4, §6.5), served from the edge cache like marketing pages.
 *
 * 6a skeleton: no D1 reads yet. The only indexable page is the `en` landing (page SEO, posts, authors and legal pages
 * come in 6b–6e and add their entries here). Sitemap locales follow `blogLocales` (D9/K14, today `['en']`); 6d adds
 * every locale with a live page.
 */
export const sitemapLocales: ReadonlyArray<Locale> = LOCALES.filter((locale) => blogLocales.includes(locale))

/** Single-URL pages that are indexable per locale in 6a: only the landing, only in `en` (no page is `live` elsewhere yet). */
const livePages: ReadonlyArray<{ readonly path: string; readonly live: ReadonlyArray<Locale> }> = [{ path: pagePaths.landing, live: ['en'] }]

export const robotsTxt = Effect.gen(function* () {
  const { appEnv, siteUrl } = yield* AppConfig
  return buildRobotsTxt({ appEnv, siteUrl })
})

export const sitemapIndexXml = Effect.gen(function* () {
  const { siteUrl } = yield* AppConfig
  return buildSitemapIndex(sitemapLocales.map((locale) => ({ loc: `${siteUrl.origin}${paths.sitemap(locale)}` })))
})

/** One locale's sitemap; 404 for a locale without one (not in the index, never cached). */
export const sitemapXml = Effect.fn('sitemapXml')(function* (locale: Locale) {
  if (!sitemapLocales.includes(locale)) return yield* new ResourceUnavailable()
  const { siteUrl } = yield* AppConfig
  const entries = livePages.flatMap((page): ReadonlyArray<SitemapEntry> => {
    if (!page.live.includes(locale)) return []
    const alternates = sameAlternates(page.path, page.live)
    const href = (l: Locale) => `${siteUrl.origin}${alternates[l] ?? alternates.en}`
    return [{
      loc: href(locale),
      alternates: [...liveLocales(alternates).map((l) => ({ hreflang: l, href: href(l) })), { hreflang: 'x-default', href: href('en') }],
    }]
  })
  return buildSitemap(entries)
})
