import { describe, expect, it } from 'vitest'
import { buildHead, canonicalUrl, type Head, type HeadInput, liveLocales, sameAlternates } from './head'
import { organization, website } from './jsonld'

const siteUrl = new URL('https://viz-cad.com')
const base: HeadInput = {
  siteUrl,
  locale: 'en',
  alternates: { en: '/pricing' },
  title: 'Pricing · VizCad',
  description: 'Plans for teams.',
  siteName: 'VizCad',
}

const metaOf = (head: Head, key: string) =>
  head.meta.filter((m) => ('property' in m && m.property === key) || ('name' in m && m.name === key)).map((m) => ('content' in m ? m.content : m.title))
const hreflang = (head: Head) => head.links.filter((l) => l.rel === 'alternate').map((l) => [l.hrefLang, l.href])
const canonical = (head: Head) => head.links.filter((l) => l.rel === 'canonical').map((l) => l.href)

describe('sameAlternates', () => {
  it('en is always present; the given live locales get their prefix; order follows LOCALES', () => {
    expect(sameAlternates('/', [])).toEqual({ en: '/' })
    expect(sameAlternates('/', ['fr', 'tr'])).toEqual({ en: '/', tr: '/tr', fr: '/fr' })
    expect(sameAlternates('/pricing', ['de'])).toEqual({ en: '/pricing', de: '/de/pricing' })
    expect(liveLocales(sameAlternates('/faq', ['fr', 'tr', 'en']))).toEqual(['en', 'tr', 'fr'])
  })
})

describe('buildHead', () => {
  it('only en: canonical to itself, hreflang en + x-default, no og:locale:alternate', () => {
    const head = buildHead(base)
    expect(canonical(head)).toEqual(['https://viz-cad.com/pricing'])
    expect(hreflang(head)).toEqual([['en', 'https://viz-cad.com/pricing'], ['x-default', 'https://viz-cad.com/pricing']])
    expect(metaOf(head, 'og:locale')).toEqual(['en_US'])
    expect(metaOf(head, 'og:locale:alternate')).toEqual([])
    expect(metaOf(head, 'robots'), 'marketing pages are indexable by default').toEqual([])
  })

  it('all 5 locales live: every page lists all five plus x-default, itself included', () => {
    const alternates = sameAlternates('/pricing', ['tr', 'de', 'es', 'fr'])
    for (const locale of ['en', 'tr', 'de', 'es', 'fr'] as const) {
      const head = buildHead({ ...base, locale, alternates })
      expect(canonical(head)).toEqual([`https://viz-cad.com${locale === 'en' ? '' : `/${locale}`}/pricing`])
      expect(hreflang(head)).toEqual([
        ['en', 'https://viz-cad.com/pricing'],
        ['tr', 'https://viz-cad.com/tr/pricing'],
        ['de', 'https://viz-cad.com/de/pricing'],
        ['es', 'https://viz-cad.com/es/pricing'],
        ['fr', 'https://viz-cad.com/fr/pricing'],
        ['x-default', 'https://viz-cad.com/pricing'],
      ])
      expect(metaOf(head, 'og:locale:alternate')).toHaveLength(4)
    }
  })

  it('en + tr: the tr page is canonical to itself, og:locale tr_TR with en_US as alternate', () => {
    const head = buildHead({ ...base, locale: 'tr', alternates: sameAlternates('/', ['tr']) })
    expect(canonical(head)).toEqual(['https://viz-cad.com/tr'])
    expect(hreflang(head)).toEqual([['en', 'https://viz-cad.com/'], ['tr', 'https://viz-cad.com/tr'], ['x-default', 'https://viz-cad.com/']])
    expect(metaOf(head, 'og:locale')).toEqual(['tr_TR'])
    expect(metaOf(head, 'og:locale:alternate')).toEqual(['en_US'])
    expect(metaOf(head, 'og:url')).toEqual(['https://viz-cad.com/tr'])
  })

  it('a closed locale page: canonical en, no hreflang, no locale alternates, and not noindex', () => {
    const head = buildHead({ ...base, locale: 'de', alternates: sameAlternates('/pricing', ['tr']) })
    expect(canonical(head)).toEqual(['https://viz-cad.com/pricing'])
    expect(hreflang(head)).toEqual([])
    expect(metaOf(head, 'og:url')).toEqual(['https://viz-cad.com/pricing'])
    expect(metaOf(head, 'og:locale'), 'the card describes the canonical en page').toEqual(['en_US'])
    expect(metaOf(head, 'og:locale:alternate')).toEqual([])
    expect(metaOf(head, 'robots')).toEqual([])
  })

  it('per-locale post slugs: each locale links to its own slug', () => {
    const head = buildHead({ ...base, locale: 'tr', alternates: { en: '/blog/my-post', tr: '/tr/blog/benim-yazim' } })
    expect(hreflang(head)).toEqual([['en', 'https://viz-cad.com/blog/my-post'], ['tr', 'https://viz-cad.com/tr/blog/benim-yazim'], ['x-default', 'https://viz-cad.com/blog/my-post']])
  })

  it('canonical and alternates use the site origin only: never a query, never the site URL path', () => {
    const odd = new URL('https://viz-cad.com/some/path?utm=x#frag')
    expect(canonicalUrl({ siteUrl: odd, locale: 'en', alternates: { en: '/faq' } })).toBe('https://viz-cad.com/faq')
    const head = buildHead({ ...base, siteUrl: odd })
    for (const link of head.links) expect(link.href).not.toMatch(/[?#]/)
  })

  it('repeated og:locale:alternate entries each carry a distinct name key (TanStack keeps one meta per name ?? property)', () => {
    const head = buildHead({ ...base, alternates: sameAlternates('/', ['tr', 'de']) })
    const keys = head.meta.flatMap((m) => ('name' in m ? [m.name] : 'property' in m ? [m.property] : []))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('Open Graph and X: website by default; image with size and alt; article fields for posts', () => {
    const plain = buildHead(base)
    expect(metaOf(plain, 'og:type')).toEqual(['website'])
    expect(metaOf(plain, 'og:title')).toEqual(['Pricing · VizCad'])
    expect(metaOf(plain, 'og:description')).toEqual(['Plans for teams.'])
    expect(metaOf(plain, 'og:site_name')).toEqual(['VizCad'])
    expect(metaOf(plain, 'og:image')).toEqual([])
    expect(metaOf(plain, 'twitter:card')).toEqual(['summary_large_image'])
    expect(metaOf(plain, 'twitter:site')).toEqual([])
    expect(plain.meta[0]).toEqual({ title: 'Pricing · VizCad' })

    const post = buildHead({
      ...base,
      image: { url: 'https://viz-cad.com/api/blog/image/blog%2Fa%2F1.webp', width: 1200, height: 630, alt: 'A part' },
      article: { publishedTime: '2026-11-01T10:00:00.000Z', modifiedTime: '2026-11-02T10:00:00.000Z', authorUrl: 'https://viz-cad.com/authors/ada', section: 'Guides' },
      twitterSite: '@vizcad',
    })
    expect(metaOf(post, 'og:type')).toEqual(['article'])
    expect(metaOf(post, 'og:image')).toEqual(['https://viz-cad.com/api/blog/image/blog%2Fa%2F1.webp'])
    expect([...metaOf(post, 'og:image:width'), ...metaOf(post, 'og:image:height'), ...metaOf(post, 'og:image:alt')]).toEqual(['1200', '630', 'A part'])
    expect(metaOf(post, 'article:published_time')).toEqual(['2026-11-01T10:00:00.000Z'])
    expect(metaOf(post, 'article:modified_time')).toEqual(['2026-11-02T10:00:00.000Z'])
    expect(metaOf(post, 'article:author')).toEqual(['https://viz-cad.com/authors/ada'])
    expect(metaOf(post, 'article:section')).toEqual(['Guides'])
    expect(metaOf(post, 'twitter:site')).toEqual(['@vizcad'])
  })

  it('noindex pages get the robots meta', () => {
    expect(metaOf(buildHead({ ...base, noindex: true }), 'robots')).toEqual(['noindex, nofollow'])
  })

  it('JSON-LD: a title with </script> cannot close the script element and parses back unchanged', () => {
    const attack = '</script><script>alert(1)</script> & more'
    const head = buildHead({
      ...base,
      title: attack,
      jsonLd: [organization({ siteUrl, name: attack, logo: 'https://viz-cad.com/vizcad-logo-512.png' }), website({ siteUrl, name: 'VizCad', locale: 'en' })],
    })
    expect(head.scripts).toHaveLength(2)
    for (const script of head.scripts) {
      expect(script.type).toBe('application/ld+json')
      expect(script.children).not.toContain('</script')
      expect(script.children).not.toContain('<')
      expect(script.children).not.toContain('>')
      expect(script.children).not.toContain('&')
    }
    expect(head.scripts[0]?.children).toContain('\\u003c/script\\u003e')
    expect(head.scripts[0]?.children).toContain('\\u0026')
    expect((JSON.parse(head.scripts[0]?.children ?? '') as { name: string }).name).toBe(attack)
    // Meta content is an attribute that React escapes; the raw title stays as typed.
    expect(metaOf(head, 'og:title')).toEqual([attack])
  })
})
