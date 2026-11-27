import { describe, expect, it } from 'vitest'
import { blogImageKey, blogImageUrl, classifyLink, renderMarkdown } from './markdown'

const render = (md: string, assets?: Parameters<typeof renderMarkdown>[1]['assets']) => renderMarkdown(md, { locale: 'en', ...(assets ? { assets } : {}) })

describe('renderMarkdown: raw HTML', () => {
  it('escapes raw HTML to text and reports the tags', () => {
    const out = render('Hello <script>alert(1)</script>\n\n<div onclick="x()">block</div>\n\n<iframe src="https://evil.test"></iframe>')
    expect(out.html).not.toContain('<script')
    expect(out.html).not.toContain('<div')
    expect(out.html).not.toContain('<iframe')
    expect(out.html).toContain('&#x3C;script>alert(1)&#x3C;/script>')
    expect(out.warnings.rawHtmlTags).toEqual(['div', 'iframe', 'script'])
  })
})

describe('renderMarkdown: links', () => {
  it('keeps https, mailto and relative links; external links get rel=noopener without nofollow', () => {
    const out = render('[a](https://example.com) [b](mailto:x@y.z) [c](/blog/x) [d](#part)')
    expect(out.html).toContain('<a href="https://example.com" rel="noopener">a</a>')
    expect(out.html).toContain('<a href="mailto:x@y.z">b</a>')
    expect(out.html).toContain('<a href="/blog/x">c</a>')
    expect(out.html).toContain('<a href="#part">d</a>')
    expect(out.html).not.toContain('nofollow')
  })

  it('drops javascript:, data:, http: and protocol-relative links but keeps their text', () => {
    const out = render('[x](javascript:alert(1)) [y](data:text/html,hi) [z](http://plain.test) [w](//evil.test) [v](JaVa\tScRiPt:alert(1))')
    expect(out.html).not.toMatch(/href=/)
    expect(out.html).toContain('x')
    expect(out.html).toContain('w')
    // The tab makes the last one plain text for the parser (not a link at all), so four links were dropped.
    expect(out.warnings.droppedLinks).toEqual(['javascript:alert(1)', 'data:text/html,hi', 'http://plain.test', '//evil.test'])
  })

  it('resolves reference links through the same rules and never prints definitions', () => {
    const out = render('[ok][1] [bad][2] [missing][3]\n\n[1]: https://example.com\n[2]: javascript:alert(1)')
    expect(out.html).toContain('<a href="https://example.com" rel="noopener">ok</a>')
    expect(out.html).not.toContain('javascript')
    expect(out.html).toContain('[missing]')
  })

  it('classifies links', () => {
    expect(classifyLink(' https://x.test')).toBe('external')
    expect(classifyLink('\u0001javascript:x')).toBe('unsafe')
    expect(classifyLink('\\\\evil.test')).toBe('unsafe')
    expect(classifyLink('page')).toBe('relative')
  })
})

describe('renderMarkdown: images', () => {
  const key = 'blog/a/01J.webp'
  const assets = new Map([[key, { width: 1600, height: 900, variants: { '800': 'blog/a/01J-800.webp' } }]])

  it('keeps blog images with lazy loading, known size and a srcset', () => {
    const out = render(`![Part](${blogImageUrl(key)})`, assets)
    expect(out.html).toContain('src="/api/blog/image/blog%2Fa%2F01J.webp"')
    expect(out.html).toContain('alt="Part"')
    expect(out.html).toContain('loading="lazy"')
    expect(out.html).toContain('decoding="async"')
    expect(out.html).toContain('width="1600"')
    expect(out.html).toContain('height="900"')
    expect(out.html).toContain('srcset="/api/blog/image/blog%2Fa%2F01J-800.webp 800w, /api/blog/image/blog%2Fa%2F01J.webp 1600w"')
  })

  it('keeps legacy blog images and images on viz-cad.com without known size', () => {
    const out = render('![a](/api/blog/image/blog%2Fmy-post%2Fimg.png) ![b](https://viz-cad.com/vizcad-logo.png)')
    expect(out.html).toContain('src="/api/blog/image/blog%2Fmy-post%2Fimg.png"')
    expect(out.html).toContain('src="https://viz-cad.com/vizcad-logo.png"')
    expect(out.html).not.toContain('width=')
    expect(out.warnings.externalImages).toEqual([])
  })

  it('turns other images into a link (https) or text, with a warning', () => {
    const out = render('![chart](https://cdn.other.test/c.png) ![x](http://old.test/x.png) ![](data:image/png;base64,AAAA)')
    expect(out.html).not.toContain('<img')
    expect(out.html).toContain('<a href="https://cdn.other.test/c.png" rel="noopener">chart</a>')
    expect(out.warnings.externalImages).toHaveLength(3)
  })

  it('reads the key from an image URL, only under blog/', () => {
    expect(blogImageKey('/api/blog/image/blog%2Fa%2Fb.png')).toBe('blog/a/b.png')
    expect(blogImageKey('https://viz-cad.com/api/blog/image/blog%2Fx.png?w=1')).toBe('blog/x.png')
    expect(blogImageKey('/api/blog/image/files%2Fsecret')).toBeNull()
    expect(blogImageKey('/api/blog/image/blog%2F..%2Ffiles')).toBeNull()
    expect(blogImageKey('/api/blog/image/%E0%A4%A')).toBeNull()
  })
})

describe('renderMarkdown: headings, toc, GFM', () => {
  it('gives headings unique ids, lists h2–h3 in the toc and demotes h1', () => {
    const out = render('# Intro\n\n## Setup\n\n### Setup\n\n#### Deep\n\n## Şimdi ne?')
    expect(out.html).toContain('<h2 id="intro">Intro</h2>')
    expect(out.html).toContain('<h3 id="setup-2">Setup</h3>')
    expect(out.html).toContain('<h4 id="deep">Deep</h4>')
    expect(out.toc).toEqual([
      { depth: 2, id: 'intro', text: 'Intro' },
      { depth: 2, id: 'setup', text: 'Setup' },
      { depth: 3, id: 'setup-2', text: 'Setup' },
      { depth: 2, id: 'simdi-ne', text: 'Şimdi ne?' },
    ])
  })

  it('renders GFM tables, task lists, strikethrough and code blocks without highlighting', () => {
    const out = render('| a | b |\n|---|:-:|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~\n\n```ts\nconst x = 1 < 2\n```')
    expect(out.html).toContain('<table>')
    expect(out.html).toContain('<td align="center">2</td>')
    expect(out.html).toContain('type="checkbox"')
    expect(out.html).toContain('<del>old</del>')
    expect(out.html).toContain('<pre><code class="language-ts">const x = 1 &#x3C; 2\n</code></pre>')
  })

  it('is deterministic', () => {
    const md = '# A\n\nText [x](https://x.test) <b>raw</b>\n\n![i](/api/blog/image/blog%2Fi.png)'
    expect(render(md)).toEqual(render(md))
  })
})

describe('renderMarkdown: read time', () => {
  it('uses the locale rate and is at least 1 minute', () => {
    expect(render('one two').readTimeMin).toBe(1)
    expect(renderMarkdown('word '.repeat(460), { locale: 'en' }).readTimeMin).toBe(2)
    expect(renderMarkdown('kelime '.repeat(570), { locale: 'tr' }).readTimeMin).toBe(3)
  })
})
