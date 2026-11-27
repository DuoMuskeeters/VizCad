/**
 * JSON-LD builders (docs/12 §6.3). Pure, the same on server and client. `@id`s are fixed: `{siteUrl}/#organization`,
 * `{siteUrl}/#website`, `{author URL}#person`, `{blog URL}#blog`, `{post URL}#article`.
 */
import type { Locale } from '#/i18n/locales'

export type JsonLd = { readonly [key: string]: JsonValue }
type JsonValue = string | number | boolean | null | ReadonlyArray<JsonValue> | JsonLd

/**
 * `JSON.stringify` plus `<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026` (six-character JSON escapes). The output is
 * still valid JSON that parses to the same value, and no string inside it can close the `<script>` element.
 * U+2028/U+2029 are escaped too (valid JSON, but line terminators in older script parsers).
 */
export const serializeJsonLd = (value: JsonLd | ReadonlyArray<JsonLd>): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

const base = (siteUrl: URL) => siteUrl.origin
export const organizationId = (siteUrl: URL) => `${base(siteUrl)}/#organization`
export const websiteId = (siteUrl: URL) => `${base(siteUrl)}/#website`

export interface OrganizationInput {
  readonly siteUrl: URL
  readonly name: string
  /** `site_settings.organization.legalName`; omitted when unset. */
  readonly legalName?: string
  /** Absolute logo URL. */
  readonly logo: string
  /** `site_settings.organization.sameAs`: official profiles. */
  readonly sameAs?: ReadonlyArray<string>
}

export const organization = (input: OrganizationInput): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': organizationId(input.siteUrl),
  name: input.name,
  url: `${base(input.siteUrl)}/`,
  logo: input.logo,
  ...(input.legalName ? { legalName: input.legalName } : {}),
  ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: [...input.sameAs] } : {}),
})

/** BCP 47 tags for `inLanguage`. */
const languageTag: Record<Locale, string> = { en: 'en', tr: 'tr', de: 'de', es: 'es', fr: 'fr' }

export const website = (input: { readonly siteUrl: URL; readonly name: string; readonly locale: Locale }): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': websiteId(input.siteUrl),
  name: input.name,
  url: `${base(input.siteUrl)}/`,
  inLanguage: languageTag[input.locale],
  publisher: { '@id': organizationId(input.siteUrl) },
})

/** `{author page URL}#person`, the Person node every post and the author page share. */
export const personId = (authorUrl: string) => `${authorUrl}#person`
export const blogId = (blogUrl: string) => `${blogUrl}#blog`

export interface PersonInput {
  readonly name: string
  /** Absolute author page URL; without it the Person has no `@id` and no `url` (legacy author without a slug). */
  readonly url?: string
  readonly jobTitle?: string | null
  readonly image?: string | null
  readonly description?: string | null
  readonly sameAs?: ReadonlyArray<string>
}

export const person = (input: PersonInput): JsonLd => ({
  '@type': 'Person',
  ...(input.url ? { '@id': personId(input.url), url: input.url } : {}),
  name: input.name,
  ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
  ...(input.image ? { image: input.image } : {}),
  ...(input.description ? { description: input.description } : {}),
  ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: [...input.sameAs] } : {}),
})

export interface BlogPostingInput {
  readonly siteUrl: URL
  /** Absolute canonical URL of the post. */
  readonly url: string
  /** Absolute URL of the blog list in this locale. */
  readonly blogUrl: string
  readonly headline: string
  readonly description: string
  /** Absolute image URL (the OG image, 1200 px wide when known). */
  readonly image?: string
  /** ISO 8601. */
  readonly datePublished: string
  readonly dateModified: string
  readonly locale: Locale
  readonly author?: PersonInput
  readonly section?: string
  readonly keywords?: ReadonlyArray<string>
}

/** `BlogPosting` (docs/12 §6.3): the author is the shared Person node, the publisher the Organization. */
export const blogPosting = (input: BlogPostingInput): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  '@id': `${input.url}#article`,
  headline: input.headline,
  description: input.description,
  ...(input.image ? { image: [input.image] } : {}),
  datePublished: input.datePublished,
  dateModified: input.dateModified,
  inLanguage: languageTag[input.locale],
  ...(input.author ? { author: input.author.url ? { '@id': personId(input.author.url), name: input.author.name, url: input.author.url } : person(input.author) } : {}),
  publisher: { '@id': organizationId(input.siteUrl) },
  mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
  isPartOf: { '@id': blogId(input.blogUrl) },
  ...(input.section ? { articleSection: input.section } : {}),
  ...(input.keywords && input.keywords.length > 0 ? { keywords: input.keywords.join(', ') } : {}),
  url: input.url,
})

/** `Blog` for the list page: the posts on that page, `@id` + headline + url only. */
export const blog = (input: {
  readonly siteUrl: URL
  readonly blogUrl: string
  /** Absolute URL of this list page (page 2 has its own). */
  readonly url: string
  readonly name: string
  readonly description: string
  readonly locale: Locale
  readonly posts: ReadonlyArray<{ readonly url: string; readonly headline: string }>
}): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': blogId(input.blogUrl),
  name: input.name,
  description: input.description,
  url: input.url,
  inLanguage: languageTag[input.locale],
  publisher: { '@id': organizationId(input.siteUrl) },
  blogPost: input.posts.map((p) => ({ '@type': 'BlogPosting', '@id': `${p.url}#article`, headline: p.headline, url: p.url })),
})

/** `ProfilePage` with the author as `mainEntity` (D5, E-E-A-T). */
export const profilePage = (input: { readonly url: string; readonly locale: Locale; readonly person: PersonInput & { readonly url: string } }): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  '@id': input.url,
  url: input.url,
  inLanguage: languageTag[input.locale],
  mainEntity: person(input.person),
})

/** `BreadcrumbList`; every item has an absolute URL. */
export const breadcrumbList = (items: ReadonlyArray<{ readonly name: string; readonly url: string }>): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
})
