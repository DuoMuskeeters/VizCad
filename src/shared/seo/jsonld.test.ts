import { describe, expect, it } from 'vitest'
import { organization, serializeJsonLd, website } from './jsonld'

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
