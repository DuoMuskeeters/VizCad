import { describe, expect, it } from 'vitest'
import { NOINDEX, withNoindex } from './noindex'

describe('withNoindex', () => {
  it('marks every non-production response noindex, keeping status, body and headers', async () => {
    const out = withNoindex('staging', new Response('hi', { status: 404, headers: { 'content-type': 'text/plain' } }))
    expect(out.headers.get('X-Robots-Tag')).toBe(NOINDEX)
    expect(out.status).toBe(404)
    expect(out.headers.get('content-type')).toBe('text/plain')
    expect(await out.text()).toBe('hi')
  })

  it('works on an immutable response (a cache hit) and when APP_ENV is missing', () => {
    expect(withNoindex(undefined, Response.redirect('https://example.com/', 301)).headers.get('X-Robots-Tag')).toBe(NOINDEX)
  })

  it('leaves production responses untouched', () => {
    const response = new Response('ok')
    expect(withNoindex('production', response)).toBe(response)
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })
})
