import { assert, describe, it } from '@effect/vitest'
import { legacySharedRedirect } from './legacyRedirect'

const redirect = (path: string) => legacySharedRedirect(new Request(`https://vizcad.test${path}`))

describe('/shared/<token> -> /s/<token>', () => {
  it('redirects a legacy token without keeping the query string', () => {
    const res = redirect('/shared/abcdefghijklmnopqrstuvwxyz012345?next=https://evil.test')
    assert.deepStrictEqual([res.status, res.headers.get('location')], [302, '/s/abcdefghijklmnopqrstuvwxyz012345'])
    assert.strictEqual(res.headers.get('cache-control'), 'private, no-store')
    assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer')
  })

  it('accepts a trailing slash and a new-style token', () => {
    assert.strictEqual(redirect(`/shared/${'A_-'.repeat(14)}Ab/`).headers.get('location'), `/s/${'A_-'.repeat(14)}Ab`)
  })

  it.each(['/shared/', '/shared/a/b', '/shared/a%2Fb', '/shared/a b', '/shared/..', `/shared/${'a'.repeat(65)}`, '/shared/a%0d%0aSet-Cookie:x'])('answers 404 for %s', (path) => {
    const res = redirect(path)
    assert.strictEqual(res.status, 404)
    assert.isNull(res.headers.get('location'))
  })
})
