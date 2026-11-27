import { describe, expect, it } from 'vitest'
import { buildRss } from './rss'

describe('buildRss', () => {
  it('is RSS 2.0 with escaped text, absolute links, RFC 822 dates and a self link', () => {
    const xml = buildRss({
      title: 'VizCad Blog',
      description: 'Notes & guides',
      link: 'https://viz-cad.com/blog',
      self: 'https://viz-cad.com/blog/rss.xml',
      locale: 'en',
      items: [{ title: 'STEP <vs> IGES', url: 'https://viz-cad.com/blog/step', excerpt: 'A & B', category: 'cad', publishedAt: 1_700_000_000, updatedAt: 1_700_000_500 }],
    })
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<title>STEP &lt;vs&gt; IGES</title>')
    expect(xml).toContain('<description>Notes &amp; guides</description>')
    expect(xml).toContain('<guid isPermaLink="true">https://viz-cad.com/blog/step</guid>')
    expect(xml).toContain('<pubDate>Tue, 14 Nov 2023 22:13:20 GMT</pubDate>')
    expect(xml).toContain('<lastBuildDate>Tue, 14 Nov 2023 22:21:40 GMT</lastBuildDate>')
    expect(xml).toContain('<atom:link href="https://viz-cad.com/blog/rss.xml" rel="self" type="application/rss+xml"/>')
    expect(xml).not.toContain('<content')
  })

  it('an empty feed has no lastBuildDate and no items', () => {
    const xml = buildRss({ title: 't', description: 'd', link: 'https://x.test/blog', self: 'https://x.test/blog/rss.xml', locale: 'en', items: [] })
    expect(xml).not.toContain('<item>')
    expect(xml).not.toContain('lastBuildDate')
  })
})
