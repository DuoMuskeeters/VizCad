import { describe, expect, it } from 'vitest'
import { blog, blogPosting, breadcrumbList, organization, person, profilePage, serializeJsonLd, website } from './jsonld'

const siteUrl = new URL('https://viz-cad.com')
const attack = '</script><script>alert(1)</script>'

describe('serializeJsonLd', () => {
  it('a value containing </script> cannot close the script element and parses back unchanged', () => {
    const value = { '@type': 'BlogPosting', headline: attack, description: 'Tom & Jerry > Spike' }
    const out = serializeJsonLd(value)
    expect(out).not.toContain('</script')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).not.toContain('&')
    expect(out).toContain('\\u003c/script\\u003e')
    expect(out).toContain('\\u0026')
    expect(JSON.parse(out)).toEqual(value)
  })

  it('escapes U+2028/U+2029 and keeps them on parse', () => {
    const value = { name: 'a\u2028b\u2029c' }
    const out = serializeJsonLd(value)
    expect(out).toBe('{"name":"a\\u2028b\\u2029c"}')
    expect(JSON.parse(out)).toEqual(value)
  })
})

describe('Organization and WebSite', () => {
  it('fixed @ids, the expected keys, publisher points at the organization', () => {
    const org = organization({ siteUrl, name: 'VizCad', legalName: 'VizCad & Co', logo: 'https://viz-cad.com/vizcad-logo-512.png', sameAs: ['https://github.com/x'] })
    expect(Object.keys(org).sort()).toEqual(['@context', '@id', '@type', 'legalName', 'logo', 'name', 'sameAs', 'url'])
    expect(org['@id']).toBe('https://viz-cad.com/#organization')
    const site = website({ siteUrl, name: 'VizCad', locale: 'tr' })
    expect(site).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': 'https://viz-cad.com/#website',
      name: 'VizCad',
      url: 'https://viz-cad.com/',
      inLanguage: 'tr',
      publisher: { '@id': 'https://viz-cad.com/#organization' },
    })
  })

  it('omits legalName and sameAs when the settings are empty; a hostile setting is still safe once serialized', () => {
    const org = organization({ siteUrl, name: attack, logo: 'https://viz-cad.com/l.png', sameAs: [] })
    expect(org).not.toHaveProperty('legalName')
    expect(org).not.toHaveProperty('sameAs')
    expect(serializeJsonLd([org, website({ siteUrl, name: 'VizCad', locale: 'en' })])).not.toContain('</script')
  })
})

describe('blog types (6b)', () => {
  const siteUrl = new URL('https://viz-cad.com')
  const post = {
    siteUrl,
    url: 'https://viz-cad.com/blog/step',
    blogUrl: 'https://viz-cad.com/blog',
    headline: 'STEP </script><script>alert(1)</script> & IGES',
    description: 'd',
    image: 'https://viz-cad.com/api/blog/image/blog%2Fc.png',
    datePublished: '2025-11-24T16:00:00.000Z',
    dateModified: '2025-11-25T16:00:00.000Z',
    locale: 'en' as const,
  }

  it('BlogPosting references the Person, the Organization and the Blog by @id', () => {
    const value = blogPosting({ ...post, author: { name: 'Ada', url: 'https://viz-cad.com/authors/ada' }, section: 'Guides', keywords: ['step', 'iges'] })
    expect(value).toMatchObject({
      '@type': 'BlogPosting',
      '@id': 'https://viz-cad.com/blog/step#article',
      inLanguage: 'en',
      author: { '@id': 'https://viz-cad.com/authors/ada#person', name: 'Ada' },
      publisher: { '@id': 'https://viz-cad.com/#organization' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://viz-cad.com/blog/step' },
      isPartOf: { '@id': 'https://viz-cad.com/blog#blog' },
      image: ['https://viz-cad.com/api/blog/image/blog%2Fc.png'],
      articleSection: 'Guides',
      keywords: 'step, iges',
    })
  })

  it('an author without a page is an inline Person without @id or url', () => {
    const value = blogPosting({ ...post, author: { name: 'Legacy' } })
    expect(value['author']).toEqual({ '@type': 'Person', name: 'Legacy' })
  })

  it('a headline with </script> cannot close the script element and parses back unchanged', () => {
    const out = serializeJsonLd(blogPosting(post))
    expect(out).not.toContain('</script')
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c/script\\u003e')
    expect(out).toContain('\\u0026')
    expect((JSON.parse(out) as { headline: string }).headline).toBe(post.headline)
  })

  it('Person keeps only what is known; ProfilePage wraps it; Blog lists the page posts; BreadcrumbList numbers items', () => {
    expect(person({ name: 'Ada', url: 'https://viz-cad.com/authors/ada', jobTitle: null, sameAs: [] })).toEqual({
      '@type': 'Person',
      '@id': 'https://viz-cad.com/authors/ada#person',
      url: 'https://viz-cad.com/authors/ada',
      name: 'Ada',
    })
    expect(profilePage({ url: 'https://viz-cad.com/authors/ada', locale: 'en', person: { name: 'Ada', url: 'https://viz-cad.com/authors/ada', jobTitle: 'Engineer', sameAs: ['https://x.com/ada'] } })).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', jobTitle: 'Engineer', sameAs: ['https://x.com/ada'] },
    })
    expect(blog({ siteUrl, blogUrl: post.blogUrl, url: 'https://viz-cad.com/blog/page/2', name: 'VizCad Blog', description: 'd', locale: 'en', posts: [{ url: post.url, headline: 'h' }] })).toMatchObject({
      '@id': 'https://viz-cad.com/blog#blog',
      url: 'https://viz-cad.com/blog/page/2',
      blogPost: [{ '@type': 'BlogPosting', '@id': 'https://viz-cad.com/blog/step#article', headline: 'h', url: post.url }],
    })
    expect(breadcrumbList([{ name: 'Home', url: 'https://viz-cad.com/' }, { name: 'Blog', url: post.blogUrl }])['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://viz-cad.com/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://viz-cad.com/blog' },
    ])
  })
})
