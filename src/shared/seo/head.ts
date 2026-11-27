/**
 * The shared `<head>` builder (docs/12 §6.1, §6.2). Pure, the same on server and client: a route's `head()` turns its
 * loader data into this input and returns the result as is (`{ meta, links, scripts }` is TanStack's head shape).
 *
 * - `canonical`: absolute, `siteUrl` origin + path, never a query. A page that is live in its locale points at itself;
 *   a closed locale (rendered with English fallback texts) points at the `en` page.
 * - `hreflang`: one `alternate` per live locale (the page lists itself too) plus `x-default` (= `en`). A closed locale
 *   page prints no hreflang at all, and is not `noindex` (canonical + noindex would contradict each other).
 * - Open Graph and X cards; `og:locale:alternate` for the other live locales.
 * - JSON-LD through `serializeJsonLd` (`<`, `>`, `&` escaped), so no value can close the `<script>` element.
 */
import { LOCALES, type Locale } from '#/i18n/locales'
import { localizedPath } from '#/shared/marketingRoutes'
import { type JsonLd, serializeJsonLd } from './jsonld'

export type HeadMeta =
  | { readonly title: string }
  | { readonly name: string; readonly content: string; readonly property?: string }
  | { readonly property: string; readonly content: string }

export interface HeadLink {
  readonly rel: string
  readonly href: string
  readonly hrefLang?: string
  readonly type?: string
  readonly title?: string
}

export interface HeadScript {
  readonly type: 'application/ld+json'
  readonly children: string
}

export interface Head {
  readonly meta: ReadonlyArray<HeadMeta>
  readonly links: ReadonlyArray<HeadLink>
  readonly scripts: ReadonlyArray<HeadScript>
}

/** Live locale → that locale's own path (prefixed, e.g. `/tr/blog/benim-yazim`). `en` is always live (K3, §2). */
export type Alternates = Readonly<Partial<Record<Locale, string>>> & { readonly en: string }

export interface HeadImage {
  /** Absolute URL (1200×630 preferred, docs/12 §6.8). */
  readonly url: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

export interface ArticleMeta {
  /** ISO 8601. */
  readonly publishedTime: string
  readonly modifiedTime: string
  /** Absolute author page URL, when the author has one. */
  readonly authorUrl?: string
  readonly section?: string
}

export interface HeadInput {
  readonly siteUrl: URL
  /** The locale of the URL being rendered. */
  readonly locale: Locale
  readonly alternates: Alternates
  readonly title: string
  readonly description: string
  readonly siteName: string
  readonly image?: HeadImage
  /** `website` unless an article is given. */
  readonly article?: ArticleMeta
  /** `site_settings` X handle, e.g. `@vizcad`. */
  readonly twitterSite?: string
  readonly jsonLd?: ReadonlyArray<JsonLd>
  /** Preview, old legal versions: `noindex, nofollow` (the Worker adds the header for app routes). */
  readonly noindex?: boolean
}

/** `og:locale` values. */
export const ogLocale: Record<Locale, string> = { en: 'en_US', tr: 'tr_TR', de: 'de_DE', es: 'es_ES', fr: 'fr_FR' }

/** The same path in every given locale (pages whose route parts are English everywhere, D3). */
export const sameAlternates = (path: string, live: ReadonlyArray<Locale>): Alternates => {
  const map: Partial<Record<Locale, string>> = {}
  for (const locale of LOCALES) if (locale === 'en' || live.includes(locale)) map[locale] = localizedPath(locale, path)
  return { ...map, en: localizedPath('en', path) }
}

/** Live locales in the fixed LOCALES order, `en` first. */
export const liveLocales = (alternates: Alternates): ReadonlyArray<Locale> => LOCALES.filter((locale) => alternates[locale] !== undefined)

const absolute = (siteUrl: URL, path: string) => `${siteUrl.origin}${path}`

export const canonicalUrl = (input: Pick<HeadInput, 'siteUrl' | 'locale' | 'alternates'>): string =>
  absolute(input.siteUrl, input.alternates[input.locale] ?? input.alternates.en)

export const buildHead = (input: HeadInput): Head => {
  const live = input.alternates[input.locale] !== undefined
  const canonical = canonicalUrl(input)
  const locales = liveLocales(input.alternates)

  const hreflang: Array<HeadLink> = live
    ? [
        ...locales.map((locale) => ({ rel: 'alternate', hrefLang: locale, href: absolute(input.siteUrl, input.alternates[locale] ?? input.alternates.en) })),
        { rel: 'alternate', hrefLang: 'x-default', href: absolute(input.siteUrl, input.alternates.en) },
      ]
    : []

  const image: ReadonlyArray<HeadMeta> = input.image
    ? [
        { property: 'og:image', content: input.image.url },
        { property: 'og:image:width', content: String(input.image.width) },
        { property: 'og:image:height', content: String(input.image.height) },
        { property: 'og:image:alt', content: input.image.alt },
        { name: 'twitter:image', content: input.image.url },
        { name: 'twitter:image:alt', content: input.image.alt },
      ]
    : []

  const article: ReadonlyArray<HeadMeta> = input.article
    ? [
        { property: 'article:published_time', content: input.article.publishedTime },
        { property: 'article:modified_time', content: input.article.modifiedTime },
        ...(input.article.authorUrl ? [{ property: 'article:author', content: input.article.authorUrl }] : []),
        ...(input.article.section ? [{ property: 'article:section', content: input.article.section }] : []),
      ]
    : []

  // TanStack's HeadContent keeps one meta per `name ?? property`, so repeated properties need their own `name` key.
  const localeAlternates: ReadonlyArray<HeadMeta> = live
    ? locales.filter((locale) => locale !== input.locale).map((locale) => ({ name: `og:locale:alternate:${locale}`, property: 'og:locale:alternate', content: ogLocale[locale] }))
    : []

  const meta: ReadonlyArray<HeadMeta> = [
    { title: input.title },
    { name: 'description', content: input.description },
    ...(input.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    { property: 'og:type', content: input.article ? 'article' : 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:site_name', content: input.siteName },
    { property: 'og:locale', content: ogLocale[input.locale] },
    ...localeAlternates,
    ...image,
    ...article,
    { name: 'twitter:card', content: 'summary_large_image' },
    ...(input.twitterSite ? [{ name: 'twitter:site', content: input.twitterSite }] : []),
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
  ]

  return {
    meta,
    links: [{ rel: 'canonical', href: canonical }, ...hreflang],
    scripts: (input.jsonLd ?? []).map((value) => ({ type: 'application/ld+json', children: serializeJsonLd(value) })),
  }
}
