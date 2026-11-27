/**
 * JSON-LD builders (docs/12 §6.3). Pure, the same on server and client. `@id`s are fixed: `{siteUrl}/#organization`,
 * `{siteUrl}/#website`. 6a has Organization and WebSite; the blog types come in 6b.
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
