import { assert, describe, it } from '@effect/vitest'
import { locales } from './auth'
import { invitationEmail } from './invitations'

describe('invitationEmail', () => {
  it('has copy in all five locales for both kinds', () => {
    const subjects = new Set<string>()
    for (const kind of ['member', 'guest'] as const) {
      for (const locale of locales) {
        const mail = invitationEmail({ kind, locale, inviterEmail: 'ada@example.com', url: 'https://vizcad.test/invite/1' })
        assert.isAbove(mail.subject.length, 0)
        assert.include(mail.text, 'ada@example.com')
        subjects.add(mail.subject)
      }
    }
    assert.strictEqual(subjects.size, 10)
  })

  it('escapes the inviter address and the link in HTML', () => {
    const mail = invitationEmail({ kind: 'member', locale: 'en', inviterEmail: '"><img src=x>@evil.test', url: 'https://vizcad.test/invite/a"b<c' })
    assert.notInclude(mail.html, '<img')
    assert.include(mail.html, '&quot;&gt;&lt;img src=x&gt;@evil.test')
    assert.include(mail.html, 'href="https://vizcad.test/invite/a&quot;b&lt;c"')
  })

  it('inserts the inviter address literally, even with replacement patterns like $& or $1', () => {
    const mail = invitationEmail({ kind: 'member', locale: 'en', inviterEmail: "a$&b$1$'@evil.test", url: 'https://vizcad.test/invite/1' })
    assert.include(mail.text, "a$&b$1$'@evil.test")
    assert.notInclude(mail.text, '{inviter}')
    assert.include(mail.html, 'a$&amp;b$1$&#39;@evil.test')
    assert.notInclude(mail.html, '{inviter}')
  })
})
