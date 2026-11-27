import { describe, expect, it } from 'vitest'
import { isValidSlug, SLUG_MAX, slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('maps the letters of the five locales and drops accents', () => {
    expect(slugify('Işık ğüşçö İstanbul')).toBe('isik-gusco-istanbul')
    expect(slugify('Straße Größe Übung')).toBe('strasse-grosse-ubung')
    expect(slugify('Año español niño')).toBe('ano-espanol-nino')
    expect(slugify('Élève à côté, déjà œuvre')).toBe('eleve-a-cote-deja-oeuvre')
  })

  it('collapses every other run to one dash and trims dashes', () => {
    expect(slugify('  CAD -- files & 3D/STEP!  ')).toBe('cad-files-3d-step')
    expect(slugify('***')).toBe('')
  })

  it('reserved words get a suffix', () => {
    expect(slugify('Page')).toBe('page-1')
    expect(isValidSlug('page')).toBe(false)
    expect(isValidSlug('rss.xml')).toBe(false)
  })

  it('cuts at 96 on a word boundary', () => {
    const long = slugify(`${'word '.repeat(30)}end`)
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
    expect(long.endsWith('-')).toBe(false)
    expect(isValidSlug(long)).toBe(true)
    expect(slugify('a'.repeat(120))).toHaveLength(SLUG_MAX)
  })

  it('validates the rule', () => {
    expect(isValidSlug('cad-viewer-2')).toBe(true)
    expect(isValidSlug('CAD')).toBe(false)
    expect(isValidSlug('a--b')).toBe(false)
    expect(isValidSlug('-a')).toBe(false)
    expect(isValidSlug('a'.repeat(97))).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('appends -2, -3 until free and stays within the limit', () => {
    const taken = new Set(['x', 'x-2'])
    expect(uniqueSlug('x', (s) => taken.has(s))).toBe('x-3')
    expect(uniqueSlug('free', (s) => taken.has(s))).toBe('free')
    const base = 'a'.repeat(SLUG_MAX)
    expect(uniqueSlug(base, (s) => s === base)).toHaveLength(SLUG_MAX)
  })
})
