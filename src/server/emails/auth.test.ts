import { assert, describe, it } from 'vitest'
import { escapeHtml, locales, localeFromHeader, passwordResetEmail, verificationEmail } from './auth'

describe('identity emails', () => {
  it('every locale renders subject, text and html with the link', () => {
    for (const locale of locales) {
      for (const render of [verificationEmail, passwordResetEmail]) {
        const mail = render({ name: 'Ada', url: 'https://viz-cad.com/api/auth/verify-email?token=t', locale })
        assert.isAbove(mail.subject.length, 5)
        assert.include(mail.text, 'https://viz-cad.com/api/auth/verify-email?token=t')
        assert.include(mail.html, 'Ada')
      }
    }
    assert.notStrictEqual(verificationEmail({ name: 'A', url: 'u', locale: 'tr' }).subject, verificationEmail({ name: 'A', url: 'u', locale: 'en' }).subject)
  })

  it('escapes the name and the link by context', () => {
    const mail = verificationEmail({ name: '<script>alert(1)</script> "x"', url: 'https://viz-cad.com/?a=1&b="><img src=x>', locale: 'en' })
    assert.notInclude(mail.html, '<script>')
    assert.notInclude(mail.html, '"><img')
    assert.include(mail.html, '&lt;script&gt;')
    assert.include(mail.html, 'a=1&amp;b=&quot;&gt;&lt;img src=x&gt;')
    assert.strictEqual(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;')
  })

  it('picks the first supported language from Accept-Language, else English', () => {
    assert.strictEqual(localeFromHeader('tr-TR,tr;q=0.9,en;q=0.8'), 'tr')
    assert.strictEqual(localeFromHeader('ja,de;q=0.5'), 'de')
    assert.strictEqual(localeFromHeader('ja'), 'en')
    assert.strictEqual(localeFromHeader(null), 'en')
  })
})
