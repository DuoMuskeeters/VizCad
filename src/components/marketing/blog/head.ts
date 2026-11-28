import type { Locale } from '#/i18n/locales'
import { paths } from '#/shared/marketingRoutes'
import { type Alternates, buildHead, type HeadInput, sameAlternates } from '#/shared/seo/head'
import { type JsonLd, organization } from '#/shared/seo/jsonld'

export const SITE_NAME = 'VizCad'
export const BLOG_NAME = 'VizCad Blog'
export const BLOG_DESCRIPTION = 'Guides and notes on viewing, sharing and reviewing 3D CAD files.'
const TITLE_SUFFIX = ' · VizCad Blog'

/** An image URL for head tags: site-relative becomes absolute on `origin`. Here, not in BlogParts: route `head()`s run in the
 * main chunk, and BlogParts (page components) must stay out of it. */
export const absoluteUrl = (origin: string, url: string) => (url.startsWith('/') ? `${origin}${url}` : url)

/** `{title} · VizCad Blog` (docs/12 §6.1), unless the title already names the blog. */
export const blogTitle = (title: string) => (title.endsWith(TITLE_SUFFIX) || title === BLOG_NAME ? title : `${title}${TITLE_SUFFIX}`)

/** The Organization node every blog page carries, so `publisher` and `@id` references resolve on the page itself. */
export const organizationNode = (siteUrl: URL): JsonLd => organization({ siteUrl, name: SITE_NAME, logo: `${siteUrl.origin}/vizcad-logo-512.png` })

/** The blog's head: shared builder plus the RSS alternate link. Blog pages exist only in blogLocales (live there). */
export const blogHead = (input: Omit<HeadInput, 'siteName' | 'links'> & { readonly locale: Locale }) => {
  const head = buildHead({
    ...input,
    siteName: SITE_NAME,
    links: [{ rel: 'alternate', type: 'application/rss+xml', title: BLOG_NAME, href: `${input.siteUrl.origin}${paths.rss(input.locale)}` }],
  })
  return { meta: [...head.meta], links: [...head.links], scripts: [...head.scripts] }
}

export const blogListAlternates = (page: number, live: ReadonlyArray<Locale>): Alternates =>
  sameAlternates(page <= 1 ? '/blog' : `/blog/page/${page}`, live)
