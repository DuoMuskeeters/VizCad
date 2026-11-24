import { describe, expect, it } from 'vitest'
import { LOCALES, LOCALE_NAMES } from './locales'
import { en, tr, translations, type I18nKey } from './dict'

describe('i18n dict and locales', () => {
  it('defines 5 product locales with native names', () => {
    expect(LOCALES).toEqual(['en', 'tr', 'de', 'es', 'fr'])
    for (const loc of LOCALES) {
      expect(LOCALE_NAMES[loc]).toBeDefined()
      expect(LOCALE_NAMES[loc].length).toBeGreaterThan(0)
    }
  })

  it('Turkish translation has all keys of English base', () => {
    const enKeys = Object.keys(en) as I18nKey[]
    const trKeys = Object.keys(tr) as I18nKey[]
    expect(enKeys.length).toBeGreaterThan(30)
    expect(trKeys.sort()).toEqual(enKeys.sort())
  })

  it('all locales provide entries falling back to English when needed', () => {
    for (const loc of LOCALES) {
      const dict = translations[loc]
      expect(dict).toBeDefined()
      expect(dict['auth.signIn.title']).toBeDefined()
    }
  })
})
