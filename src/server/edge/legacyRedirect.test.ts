import { describe, expect, it } from 'vitest'
import { legacyRedirect } from './legacyRedirect'

const answer = (path: string, method = 'GET') => {
  const response = legacyRedirect(new Request(`https://viz-cad.com${path}`, { method }))
  return response === null ? null : { status: response.status, location: response.headers.get('location'), cache: response.headers.get('cache-control') }
}

describe('legacy app redirects (docs/12 §6.9)', () => {
  it.each([
    ['/dashboard', 'https://viz-cad.com/app'],
    ['/dashboard/', 'https://viz-cad.com/app'],
    ['/file/abc_123-XYZ', 'https://viz-cad.com/app/files/abc_123-XYZ'],
    ['/login', 'https://viz-cad.com/sign-in'],
    ['/login?next=/dashboard', 'https://viz-cad.com/sign-in'],
    ['/signup', 'https://viz-cad.com/sign-up'],
    ['/signup?invite=x', 'https://viz-cad.com/sign-up'],
  ])('%s → %s, 301, private, no-store, query dropped', (path, location) => {
    expect(answer(path)).toEqual({ status: 301, location, cache: 'private, no-store' })
  })

  it('ModelSnap goes to the landing (K12) and may be cached by browsers', () => {
    expect(answer('/ModelSnap')).toEqual({ status: 301, location: 'https://viz-cad.com/', cache: 'public, max-age=86400' })
    expect(answer('/modelsnap')?.location).toBe('https://viz-cad.com/')
  })

  it('/file takes exactly one safe segment; everything else is left to the router (404)', () => {
    for (const path of ['/file/a/b', '/file/', '/file', `/file/${'a'.repeat(65)}`, '/file/a.b', '/file/%2e%2e', '/files/abc']) expect(answer(path), path).toBeNull()
  })

  it('HEAD redirects too; other methods and other paths are untouched', () => {
    expect(answer('/dashboard', 'HEAD')?.status).toBe(301)
    expect(answer('/dashboard', 'POST')).toBeNull()
    expect(answer('/Dashboard')).toBeNull()
    expect(answer('/app')).toBeNull()
    expect(answer('/')).toBeNull()
  })
})
