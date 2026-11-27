/**
 * Sitemap XML (docs/12 §6.4). Pure. `/sitemap.xml` stays the address Search Console knows and becomes the sitemap
 * index; it lists one `/sitemaps/{locale}.xml` per locale that has indexable URLs. Each `<url>` carries its real
 * `lastmod` when known and an `xhtml:link` alternate per live locale plus `x-default`. No `changefreq`/`priority`.
 */
export const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export interface SitemapAlternate {
  /** A locale or `x-default`. */
  readonly hreflang: string
  readonly href: string
}

export interface SitemapEntry {
  readonly loc: string
  readonly lastmod?: Date
  readonly alternates: ReadonlyArray<SitemapAlternate>
}

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const lastmod = (date: Date | undefined, indent: string) => (date === undefined ? [] : [`${indent}<lastmod>${date.toISOString()}</lastmod>`])

export const buildSitemap = (entries: ReadonlyArray<SitemapEntry>): string =>
  [
    HEADER,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.flatMap((entry) => [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      ...lastmod(entry.lastmod, '    '),
      ...entry.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`),
      '  </url>',
    ]),
    '</urlset>',
    '',
  ].join('\n')

export const buildSitemapIndex = (sitemaps: ReadonlyArray<{ readonly loc: string; readonly lastmod?: Date }>): string =>
  [
    HEADER,
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemaps.flatMap((s) => ['  <sitemap>', `    <loc>${escapeXml(s.loc)}</loc>`, ...lastmod(s.lastmod, '    '), '  </sitemap>']),
    '</sitemapindex>',
    '',
  ].join('\n')
