import { describe, expect, it } from 'vitest'
import { buildSitemap, buildSitemapIndex, escapeXml } from './sitemap'

describe('sitemap XML', () => {
  it('escapes the five XML characters in one place', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })

  it('a urlset with loc, lastmod and hreflang alternates; no changefreq or priority', () => {
    const xml = buildSitemap([
      {
        loc: 'https://viz-cad.com/blog/a&b',
        lastmod: new Date('2026-11-01T10:00:00Z'),
        alternates: [{ hreflang: 'en', href: 'https://viz-cad.com/blog/a&b' }, { hreflang: 'x-default', href: 'https://viz-cad.com/blog/a&b' }],
      },
      { loc: 'https://viz-cad.com/', alternates: [] },
    ])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')).toBe(true)
    expect(xml).toContain('<loc>https://viz-cad.com/blog/a&amp;b</loc>')
    expect(xml).toContain('<lastmod>2026-11-01T10:00:00.000Z</lastmod>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://viz-cad.com/blog/a&amp;b"/>')
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
    expect(xml).not.toMatch(/changefreq|priority/)
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })

  it('a sitemap index lists one sitemap per entry', () => {
    const xml = buildSitemapIndex([{ loc: 'https://viz-cad.com/sitemaps/en.xml' }, { loc: 'https://viz-cad.com/sitemaps/tr.xml', lastmod: new Date(0) }])
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.match(/<sitemap>/g)).toHaveLength(2)
    expect(xml).toContain('<loc>https://viz-cad.com/sitemaps/tr.xml</loc>\n    <lastmod>1970-01-01T00:00:00.000Z</lastmod>')
  })
})
