import { describe, expect, it } from 'vitest'
import { localeRedirect, localeRedirectTarget } from './localeRedirect'

const target = (path: string) => localeRedirectTarget(new URL(path, 'https://viz-cad.com'))

describe('localeRedirectTarget', () => {
  it.each([
    ['/en', '/'],
    ['/en/', '/'],
    ['/en/blog', '/blog'],
    ['/en/blog/my-post', '/blog/my-post'],
    ['/en/pricing/', '/pricing'],
    ['/en/app', '/app'],
    ['/en/blog?category=x', '/blog?category=x'],
    ['/tr/', '/tr'],
    ['/blog/', '/blog'],
    ['/de/legal/privacy/', '/de/legal/privacy'],
    ['/pricing//', '/pricing'],
  ])('%s → %s', (from, to) => expect(target(from)).toBe(to))

  it.each(['/', '/tr', '/blog', '/blog/my-post', '/app/', '/app/files/1/', '/s/token/', '/api/app/x/', '/EN', '/EN/blog', '/english', '/enx/blog', '/xx/', '/TR/', '/sign-in'])(
    '%s needs no redirect',
    (path) => expect(target(path)).toBeNull(),
  )
})

describe('localeRedirect', () => {
  it('answers GET and HEAD with an absolute 301 that keeps the query', () => {
    for (const method of ['GET', 'HEAD']) {
      const response = localeRedirect(new Request('https://viz-cad.com/en/faq?x=1', { method }))
      expect(response?.status).toBe(301)
      expect(response?.headers.get('location')).toBe('https://viz-cad.com/faq?x=1')
    }
  })

  it('leaves other methods and normal URLs alone', () => {
    expect(localeRedirect(new Request('https://viz-cad.com/en/faq', { method: 'POST' }))).toBeNull()
    expect(localeRedirect(new Request('https://viz-cad.com/faq'))).toBeNull()
  })
})
