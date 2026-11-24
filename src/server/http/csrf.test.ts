import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { checkMutationRequest } from './csrf'

const trusted = new Set(['https://vizcad.test', 'http://localhost:3000'])
const request = (headers: Record<string, string>, method = 'POST') =>
  new Request('https://vizcad.test/api/anything', { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) })
const json = { 'content-type': 'application/json', origin: 'https://vizcad.test' }

const reason = (r: Request) =>
  checkMutationRequest(r, trusted).pipe(
    Effect.as('ok'),
    Effect.catch((e) => Effect.succeed(e.reason)),
  )

describe('checkMutationRequest', () => {
  it.effect('accepts same-origin JSON POST, with or without Sec-Fetch-Site', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* reason(request(json)), 'ok')
      assert.strictEqual(yield* reason(request({ ...json, 'sec-fetch-site': 'same-origin' })), 'ok')
      assert.strictEqual(yield* reason(request({ ...json, 'content-type': 'Application/JSON; charset=utf-8' })), 'ok')
      assert.strictEqual(yield* reason(request({ ...json, origin: 'http://localhost:3000' })), 'ok')
    }),
  )

  it.effect('rejects other methods (GET mutations, PUT, DELETE)', () =>
    Effect.gen(function* () {
      for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) assert.strictEqual(yield* reason(request(json, method)), 'method')
    }),
  )

  it.effect('rejects a missing, null, foreign or look-alike Origin', () =>
    Effect.gen(function* () {
      const { origin: _, ...noOrigin } = json
      assert.strictEqual(yield* reason(request(noOrigin)), 'origin')
      for (const origin of ['null', 'https://evil.test', 'https://vizcad.test.evil.test', 'http://vizcad.test', 'https://vizcad.test:8443', 'https://VIZCAD.test.']) {
        assert.strictEqual(yield* reason(request({ ...json, origin })), 'origin', origin)
      }
    }),
  )

  it.effect('rejects cross-site Sec-Fetch-Site values even with a trusted Origin', () =>
    Effect.gen(function* () {
      for (const site of ['cross-site', 'same-site', 'none']) assert.strictEqual(yield* reason(request({ ...json, 'sec-fetch-site': site })), 'fetch-site', site)
    }),
  )

  it.effect('rejects non-JSON bodies (form posts, plain text, missing type)', () =>
    Effect.gen(function* () {
      for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
        assert.strictEqual(yield* reason(request({ ...json, 'content-type': type })), 'content-type', type)
      }
      assert.strictEqual(yield* reason(new Request('https://vizcad.test/x', { method: 'POST', headers: { origin: 'https://vizcad.test' }, body: '{}' })), 'content-type')
    }),
  )
})
