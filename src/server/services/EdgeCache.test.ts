import { describe, expect, it } from 'vitest'
import {
  BROWSER_CACHE_CONTROL,
  EDGE_CACHE_CONTROL,
  type EdgeCacheBinding,
  etagMatches,
  isCacheable,
  isNotModified,
  makeEtag,
  makeLastModified,
  marketingCacheKey,
  NO_STORE_HEADER,
  notModifiedSince,
  sanitizeForSsr,
  serveMarketing,
} from './EdgeCache'

const site = new URL('https://viz-cad.com')
const BUILD = 'abc1234.mf2k'

/** Fake Cache API keyed by URL. `failMatch` / `failPut` make those calls reject. */
const fakeCache = (options: { failMatch?: boolean; failPut?: boolean } = {}) => {
  const store = new Map<string, Response>()
  const puts: Array<string> = []
  const binding: EdgeCacheBinding = {
    match: (req) => (options.failMatch ? Promise.reject(new Error('down')) : Promise.resolve(store.get(req.url)?.clone())),
    put: (req, res) => {
      puts.push(req.url)
      return options.failPut ? Promise.reject(new Error('down')) : res.arrayBuffer().then((body) => void store.set(req.url, new Response(body, res)))
    },
  }
  return { binding, store, puts }
}

/**
 * A stand-in for the TanStack handler. It answers differently when it sees a cookie or a query, which is exactly
 * what must never reach a shared key; it records every request it renders.
 */
const fakeApp = (respond?: (request: Request) => Response) => {
  const seen: Array<Request> = []
  const render = (request: Request) => {
    seen.push(request)
    if (respond) return Promise.resolve(respond(request))
    const url = new URL(request.url)
    if (request.headers.has('cookie')) return Promise.resolve(new Response('signed-in header', { status: 200 }))
    if (url.search !== '') return Promise.resolve(new Response(null, { status: 301, headers: { location: '/elsewhere' } }))
    return Promise.resolve(new Response(doc(url.pathname), { status: 200, headers: { 'content-type': 'text/html', 'cache-control': 'private' } }))
  }
  return { render, seen }
}

const setup = (cacheOptions?: Parameters<typeof fakeCache>[0], respond?: (request: Request) => Response) => {
  const cache = fakeCache(cacheOptions)
  const app = fakeApp(respond)
  const pending: Array<Promise<unknown>> = []
  const logs: Array<string> = []
  let clock = 1_800_000_000_000
  const serve = async (request: Request) => {
    const key = marketingCacheKey(request, site, BUILD)
    if (key === null) throw new Error(`not a marketing request: ${request.url}`)
    const response = await serveMarketing(request, key, {
      cache: cache.binding,
      render: app.render,
      waitUntil: (p) => void pending.push(p),
      buildId: BUILD,
      now: () => clock++,
      log: (label) => void logs.push(label),
    })
    await Promise.all(pending.splice(0))
    return response
  }
  return { serve, cache, app, logs }
}

/** A complete document, as a finished SSR render ends (`</html>`). */
const doc = (path: string) => `<!DOCTYPE html><html><body><h1>${path}</h1></body></html>`

const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://viz-cad.com${path}`, { headers })

describe('marketingCacheKey', () => {
  it('drops the query string and appends the build id', () => {
    expect(marketingCacheKey(get('/blog?utm_source=x&category=y'), site, BUILD)).toBe('https://viz-cad.com/blog?v=abc1234.mf2k')
    expect(marketingCacheKey(new Request('https://viz-cad.com/', { method: 'HEAD' }), site, BUILD)).toBe('https://viz-cad.com/?v=abc1234.mf2k')
  })

  it('is null outside marketing routes, for other methods and for another host', () => {
    expect(marketingCacheKey(get('/app'), site, BUILD)).toBeNull()
    expect(marketingCacheKey(get('/api/health'), site, BUILD)).toBeNull()
    expect(marketingCacheKey(new Request('https://viz-cad.com/blog', { method: 'POST' }), site, BUILD)).toBeNull()
    expect(marketingCacheKey(new Request('https://vizcad-rewrite.example.workers.dev/blog'), site, BUILD)).toBeNull()
  })

  it('is null for plain http on the site host and for another port: only the site origin shares the https key', () => {
    expect(marketingCacheKey(new Request('http://viz-cad.com/blog'), site, BUILD)).toBeNull()
    expect(marketingCacheKey(new Request('https://viz-cad.com:8443/blog'), site, BUILD)).toBeNull()
    expect(marketingCacheKey(new Request('http://localhost/blog'), new URL('http://localhost'), BUILD)).toBe('http://localhost/blog?v=abc1234.mf2k')
  })
})

describe('sanitizeForSsr', () => {
  it('keeps origin and path; drops query, Cookie, Authorization, Accept-Language and every other header; always GET', () => {
    const original = new Request('https://viz-cad.com/blog/x?category=y', {
      method: 'HEAD',
      headers: { cookie: 'session=1', authorization: 'Bearer t', 'accept-language': 'tr', 'x-forwarded-host': 'evil.test', 'if-none-match': 'W/"x"' },
    })
    const clean = sanitizeForSsr(original)
    expect(clean.url).toBe('https://viz-cad.com/blog/x')
    expect(clean.method).toBe('GET')
    expect([...clean.headers]).toEqual([['accept', 'text/html']])
  })
})

describe('isCacheable', () => {
  const ok = () => new Response('x', { status: 200 })
  it('GET with 200 or 301 is cacheable', () => {
    expect(isCacheable(get('/'), ok())).toBe(true)
    expect(isCacheable(get('/'), new Response(null, { status: 301, headers: { location: '/x' } }))).toBe(true)
  })
  it('Set-Cookie, 404, 410, POST, HEAD and the opt-out header are not', () => {
    expect(isCacheable(get('/'), new Response('x', { headers: { 'set-cookie': 'a=1' } }))).toBe(false)
    expect(isCacheable(get('/'), new Response('x', { status: 404 }))).toBe(false)
    expect(isCacheable(get('/'), new Response('x', { status: 410 }))).toBe(false)
    expect(isCacheable(new Request('https://viz-cad.com/', { method: 'POST' }), ok())).toBe(false)
    expect(isCacheable(new Request('https://viz-cad.com/', { method: 'HEAD' }), ok())).toBe(false)
    expect(isCacheable(get('/'), new Response('x', { headers: { [NO_STORE_HEADER]: '1' } }))).toBe(false)
  })
})

describe('ETag', () => {
  it('weak tag from build and time; If-None-Match lists and * match', () => {
    const etag = makeEtag(BUILD, 36 ** 3)
    expect(etag).toBe('W/"abc1234.mf2k.1000"')
    expect(etagMatches(etag, etag)).toBe(true)
    expect(etagMatches(`"other", ${etag.replace('W/', '')}`, etag)).toBe(true)
    expect(etagMatches('*', etag)).toBe(true)
    expect(etagMatches('W/"other"', etag)).toBe(false)
    expect(etagMatches(null, etag)).toBe(false)
  })
})

describe('Last-Modified', () => {
  it('is the put time in whole seconds, as an HTTP date', () => {
    expect(makeLastModified(Date.UTC(2026, 10, 28, 9, 30, 15, 999))).toBe('Sat, 28 Nov 2026 09:30:15 GMT')
  })

  it('If-Modified-Since at or after Last-Modified is not modified; earlier, invalid or absent is', () => {
    const lm = 'Sat, 28 Nov 2026 09:30:15 GMT'
    expect(notModifiedSince(lm, lm)).toBe(true)
    expect(notModifiedSince('Sat, 28 Nov 2026 09:30:16 GMT', lm)).toBe(true)
    expect(notModifiedSince('Sat, 28 Nov 2026 09:30:14 GMT', lm)).toBe(false)
    expect(notModifiedSince('yesterday', lm)).toBe(false)
    expect(notModifiedSince(null, lm)).toBe(false)
  })

  it('If-None-Match decides when present (RFC 9110 §13.2.2); If-Modified-Since only without it', () => {
    const stored = new Headers({ etag: 'W/"b.1"', 'last-modified': 'Sat, 28 Nov 2026 09:30:15 GMT' })
    const req = (headers: Record<string, string>) => new Request('https://viz-cad.com/', { headers })
    const fresh = 'Sat, 28 Nov 2026 10:00:00 GMT'
    expect(isNotModified(req({ 'if-none-match': 'W/"b.1"' }), stored)).toBe(true)
    // A stale ETag with a fresh date is still a 200: the tag wins.
    expect(isNotModified(req({ 'if-none-match': 'W/"b.0"', 'if-modified-since': fresh }), stored)).toBe(false)
    expect(isNotModified(req({ 'if-modified-since': fresh }), stored)).toBe(true)
    expect(isNotModified(req({}), stored)).toBe(false)
    // A copy without a date (stored by an older build) never answers 304 to a date.
    expect(isNotModified(req({ 'if-modified-since': fresh }), new Headers({ etag: 'W/"b.1"' }))).toBe(false)
  })
})

describe('serveMarketing', () => {
  it('miss renders and stores; the next request is a hit; edge and browser headers differ', async () => {
    const { serve, cache, app } = setup()
    const first = await serve(get('/pricing'))
    expect(first.headers.get('x-vizcad-cache')).toBe('miss')
    expect(first.headers.get('cache-control')).toBe(BROWSER_CACHE_CONTROL)
    expect(await first.text()).toBe(doc('/pricing'))

    const stored = cache.store.get('https://viz-cad.com/pricing?v=abc1234.mf2k')
    expect(stored?.headers.get('cache-control')).toBe(EDGE_CACHE_CONTROL)
    expect(stored?.headers.get('etag')).toBe(first.headers.get('etag'))
    expect(stored?.headers.get('last-modified')).toBe(makeLastModified(1_800_000_000_000))
    expect(first.headers.get('last-modified')).toBe(stored?.headers.get('last-modified'))
    expect(stored?.headers.has('x-vizcad-cache')).toBe(false)

    const second = await serve(get('/pricing'))
    expect(second.headers.get('x-vizcad-cache')).toBe('hit')
    expect(second.headers.get('cache-control')).toBe(BROWSER_CACHE_CONTROL)
    expect(second.headers.get('etag')).toBe(first.headers.get('etag'))
    expect(second.headers.get('last-modified')).toBe(first.headers.get('last-modified'))
    expect(await second.text()).toBe(doc('/pricing'))
    expect(app.seen).toHaveLength(1)
  })

  it('a matching If-None-Match answers 304 without a body', async () => {
    const { serve } = setup()
    const etag = (await serve(get('/faq'))).headers.get('etag') ?? ''
    const revalidated = await serve(get('/faq', { 'if-none-match': etag }))
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('etag')).toBe(etag)
    expect(await revalidated.text()).toBe('')
    expect((await serve(get('/faq', { 'if-none-match': 'W/"stale"' }))).status).toBe(200)
  })

  it('without an ETag (Cloudflare drops it from HTML), If-Modified-Since from the hit answers 304', async () => {
    const { serve } = setup()
    const first = await serve(get('/blog'))
    const lastModified = first.headers.get('last-modified') ?? ''
    expect(lastModified).not.toBe('')
    const revalidated = await serve(get('/blog', { 'if-modified-since': lastModified }))
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('x-vizcad-cache')).toBe('hit')
    expect(revalidated.headers.get('cache-control')).toBe(BROWSER_CACHE_CONTROL)
    expect(revalidated.headers.get('last-modified')).toBe(lastModified)
    expect(revalidated.headers.has('content-type')).toBe(false)
    expect(await revalidated.text()).toBe('')
    // A HEAD revalidation is a 304 too; an older date gets the full page.
    expect((await serve(new Request('https://viz-cad.com/blog', { method: 'HEAD', headers: { 'if-modified-since': lastModified } }))).status).toBe(304)
    const older = await serve(get('/blog', { 'if-modified-since': 'Thu, 01 Jan 2026 00:00:00 GMT' }))
    expect(older.status).toBe(200)
    expect(await older.text()).toBe(doc('/blog'))
  })

  it('a miss never answers 304: a purge and re-render in the same second must not confirm the old page', async () => {
    const { serve, cache } = setup()
    const before = await serve(get('/blog'))
    cache.store.clear()
    // Same second as `before` (the test clock moves 1 ms per call), so only the miss rule keeps this a 200.
    const afterPurge = await serve(get('/blog', { 'if-modified-since': before.headers.get('last-modified') ?? '', 'if-none-match': '*' }))
    expect(afterPurge.headers.get('x-vizcad-cache')).toBe('miss')
    expect(afterPurge.status).toBe(200)
    expect(await afterPurge.text()).toBe(doc('/blog'))
  })

  it('poisoning: a cookie and query on the first request never reach the render or the shared key', async () => {
    const { serve, app } = setup()
    const poisoned = await serve(get('/blog?category=x', { cookie: 'session=abc', 'accept-language': 'tr' }))
    // The render saw the bare path without cookies, so the answer is the public page, not the 301 or the signed-in header.
    expect(app.seen.map((r) => r.url)).toEqual(['https://viz-cad.com/blog'])
    expect(app.seen[0]?.headers.has('cookie')).toBe(false)
    expect(poisoned.status).toBe(200)

    const bare = await serve(get('/blog'))
    expect(bare.status).toBe(200)
    expect(bare.headers.get('x-vizcad-cache')).toBe('hit')
    expect(await bare.text()).toBe(doc('/blog'))
  })

  it('HEAD: a miss renders without storing and answers without a body; the following GET is a miss with the full body', async () => {
    const { serve, cache } = setup()
    const head = await serve(new Request('https://viz-cad.com/contact', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(head.headers.get('x-vizcad-cache')).toBe('miss')
    expect(head.body).toBeNull()
    expect(cache.puts).toEqual([])

    const firstGet = await serve(get('/contact'))
    expect(firstGet.headers.get('x-vizcad-cache')).toBe('miss')
    expect(await firstGet.text()).toBe(doc('/contact'))

    const headHit = await serve(new Request('https://viz-cad.com/contact', { method: 'HEAD' }))
    expect(headHit.headers.get('x-vizcad-cache')).toBe('hit')
    expect(headHit.headers.get('etag')).toBe(firstGet.headers.get('etag'))
    expect(headHit.body).toBeNull()
    expect(cache.puts).toHaveLength(1)
  })

  it('a response with Set-Cookie, a 404 or the opt-out header is passed through and never stored', async () => {
    for (const response of [
      () => new Response('x', { headers: { 'set-cookie': 'a=1', 'cache-control': 'private, no-store' } }),
      () => new Response('missing', { status: 404 }),
      () => new Response('x', { headers: { [NO_STORE_HEADER]: '1' } }),
    ]) {
      const { serve, cache } = setup(undefined, response)
      const answer = await serve(get('/legal/terms'))
      expect(cache.puts).toEqual([])
      expect(answer.headers.get('x-vizcad-cache')).toBe('miss')
      expect(answer.headers.get('cache-control')).not.toBe(BROWSER_CACHE_CONTROL)
    }
  })

  it('a failing match is a miss; a failing put does not break the response', async () => {
    const broken = setup({ failMatch: true, failPut: true })
    const response = await broken.serve(get('/'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(doc('/'))
    expect(broken.logs).toEqual(['edge-cache.match-failed', 'edge-cache.put-failed'])
  })

  it('an SSR render that broke after the 200 (empty, cut off, a failed boundary, a failing stream) is a 500 and never stored', async () => {
    const html = { 'content-type': 'text/html; charset=utf-8' }
    const failing = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<!DOCTYPE html><html><body>'))
            controller.error(new Error('render failed'))
          },
        }),
        { headers: html },
      )
    for (const response of [
      () => new Response('', { headers: html }),
      () => new Response('<!DOCTYPE html><html><body><h1>half', { headers: html }),
      () => new Response('<!DOCTYPE html><html><body><!--$!--><template data-dgst="x"></template><!--/$--></body></html>', { headers: html }),
      () => new Response('<!DOCTYPE html><html><body><div hidden id="S:0"></div><script>$RX("B:0","x")</script></body></html>', { headers: html }),
      failing,
    ]) {
      const { serve, cache, logs } = setup(undefined, response)
      const answer = await serve(get('/authors/ada'))
      expect(answer.status).toBe(500)
      expect(answer.headers.get('cache-control')).toBe('no-store')
      expect(answer.headers.get('x-vizcad-cache')).toBe('miss')
      expect(cache.puts).toEqual([])
      expect(logs).toEqual(['edge-cache.render-incomplete'])
      // The next request renders again instead of reading a stored blank page.
      await serve(get('/authors/ada'))
      expect(cache.puts).toEqual([])
    }
  })

  it('a complete document (trailing whitespace allowed) and a non-HTML 200 are stored', async () => {
    for (const response of [
      () => new Response(`${doc('/blog')}\n`, { headers: { 'content-type': 'text/html' } }),
      () => new Response('User-agent: *', { headers: { 'content-type': 'text/plain' } }),
    ]) {
      const { serve, cache } = setup(undefined, response)
      expect((await serve(get('/blog'))).status).toBe(200)
      expect(cache.puts).toHaveLength(1)
    }
  })

  it('a 301 from the page is stored and served as a hit', async () => {
    const { serve } = setup(undefined, () => new Response(null, { status: 301, headers: { location: 'https://viz-cad.com/blog/new' } }))
    await serve(get('/blog/old'))
    const hit = await serve(get('/blog/old'))
    expect(hit.status).toBe(301)
    expect(hit.headers.get('location')).toBe('https://viz-cad.com/blog/new')
    expect(hit.headers.get('x-vizcad-cache')).toBe('hit')
  })
})
