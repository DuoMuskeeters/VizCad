import { assert, describe, it } from 'vitest'
import { escapeHtml, locales, localeFromHeader, passwordResetEmail, verificationEmail } from './auth'

describe('identity emails', () => {
  it('every locale renders subject, text and html with the link', () => {
    for (const locale of locales) {
      for (const render of [verificationEmail, passwordResetEmail]) {
        const mail = render({ url: 'https://viz-cad.com/api/auth/verify-email?token=t', locale })
        assert.isAbove(mail.subject.length, 5)
        assert.include(mail.text, 'https://viz-cad.com/api/auth/verify-email?token=t')
        assert.include(mail.html, escapeHtml(mail.text.split('\n')[0] ?? ''))
      }
    }
    assert.notStrictEqual(verificationEmail({ url: 'u', locale: 'tr' }).subject, verificationEmail({ url: 'u', locale: 'en' }).subject)
  })

  it('never renders a user name and escapes the link by context', () => {
    const mail = verificationEmail({ url: 'https://viz-cad.com/?a=1&b="><img src=x>', locale: 'en' })
    assert.notInclude(mail.html, '"><img')
    assert.include(mail.html, 'a=1&amp;b=&quot;&gt;&lt;img src=x&gt;')
    assert.strictEqual(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;')
    for (const locale of locales) assert.match(passwordResetEmail({ url: 'u', locale }).text, /^[^\s,]+,\n/, 'generic greeting')
  })

  it('picks the first supported language from Accept-Language, else English', () => {
    assert.strictEqual(localeFromHeader('tr-TR,tr;q=0.9,en;q=0.8'), 'tr')
    assert.strictEqual(localeFromHeader('ja,de;q=0.5'), 'de')
    assert.strictEqual(localeFromHeader('ja'), 'en')
    assert.strictEqual(localeFromHeader(null), 'en')
  })
})
