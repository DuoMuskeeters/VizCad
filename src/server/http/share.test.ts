import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { defaultPlan } from '../services/Entitlements'
import { createShareLink, revokeShareLink, updateShareLink } from '../programs/links'
import { glb } from '../testing/glb'
import { caller, programLayer, rows, seedDerivative, seedLink, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { shareResponse, type ShareServices } from './share'

const ORIGIN = 'https://vizcad.test'
const CONTENT = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const ids = { workspaceId: 'acme', fileId: 'f1' }

const call = (request: Request) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<ShareServices>()
    const response = yield* shareResponse(request, Layer.succeedContext(context), { requestId: 'ray-1' })
    const text = yield* Effect.promise(() => response.text())
    return { status: response.status, headers: response.headers, text }
  })

const getContent = (token: string, headers: Record<string, string> = {}, path = 'content') =>
  new Request(`${ORIGIN}/s/${token}/${path}`, { headers: { 'sec-fetch-site': 'same-origin', 'cf-ray': 'ray-1', 'cf-connecting-ip': '198.51.100.5', ...headers } })

const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'cf-ray': 'ray-1', 'cf-connecting-ip': '198.51.100.5', ...headers },
  })

const json = (text: string) => JSON.parse(text) as { ok: boolean; data?: Record<string, unknown>; error?: string; reason?: string; sharer?: string | null; captchaRequired?: boolean }

const run = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(
    Effect.andThen(Effect.gen(function* () {
      yield* seedUser('bob')
      yield* seedWorkspace('acme', 'bob')
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT, { name: 'Bracket.step' })
    })),
    Effect.andThen(body),
    Effect.provide(programLayer({ ...defaultPlan })),
  )

const share = (options: { level?: 'view' | 'download'; password?: string; expiresAt?: number } = {}) =>
  createShareLink(caller('bob'), { ...ids, level: options.level ?? 'download', ...(options.password === undefined ? {} : { password: options.password }), ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }) })
    .pipe(Effect.map((made) => made.url.slice(`${ORIGIN}/s/`.length)))

/** `name=value` of the first Set-Cookie header. */
const cookieOf = (headers: Headers) => (headers.get('set-cookie') ?? '').split(';')[0] ?? ''

describe('GET /s/{token}/content', () => {
  it.effect('serves the bytes with the safe headers and no referrer, no session needed', () =>
    run(Effect.gen(function* () {
      const token = yield* share()
      const res = yield* call(getContent(token))
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.text, CONTENT)
      const h = res.headers
      assert.deepStrictEqual(
        ['content-type', 'x-content-type-options', 'content-security-policy', 'cache-control', 'referrer-policy', 'accept-ranges'].map((n) => h.get(n)),
        ['application/octet-stream', 'nosniff', 'sandbox', 'private, no-store', 'no-referrer', 'bytes'],
      )
      assert.strictEqual(h.get('content-disposition'), `attachment; filename="Bracket.step"; filename*=UTF-8''Bracket.step`)
    })),
  )

  it.effect('206 for a Range, with the same headers', () =>
    run(Effect.gen(function* () {
      const token = yield* share()
      const res = yield* call(getContent(token, { range: 'bytes=0-12' }))
      assert.strictEqual(res.status, 206)
      assert.strictEqual(res.text, CONTENT.slice(0, 13))
      assert.strictEqual(res.headers.get('content-range'), `bytes 0-12/${CONTENT.length}`)
      assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer')
      assert.strictEqual(res.headers.get('content-security-policy'), 'sandbox')
    })),
  )

  it.effect('refuses cross-site requests (no audit row), even with a valid link, and still answers with the link headers', () =>
    run(Effect.gen(function* () {
      const token = yield* share()
      const res = yield* call(getContent(token, { 'sec-fetch-site': 'cross-site' }))
      assert.deepStrictEqual([res.status, json(res.text).error], [403, 'CsrfRejected'])
      assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer')
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store')
      assert.notInclude(res.text, token)
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['link.created'])
    })),
  )

  it.effect('a view link opens no content: 403 INSUFFICIENT_LEVEL; its thumbnail route answers 404 without one', () =>
    run(Effect.gen(function* () {
      const token = yield* share({ level: 'view' })
      const res = yield* call(getContent(token))
      assert.deepStrictEqual([res.status, json(res.text).error, json(res.text).reason], [403, 'PermissionDenied', 'INSUFFICIENT_LEVEL'])
      assert.deepStrictEqual((yield* call(getContent(token, {}, 'thumbnail'))).status, 404)
    })),
  )

  it.effect('the password is never read from the URL: any query string is a 400', () =>
    run(Effect.gen(function* () {
      const token = yield* share({ password: 'correct horse' })
      for (const query of ['?password=correct%20horse', '?x=1']) {
        const res = yield* call(new Request(`${ORIGIN}/s/${token}/content${query}`, { headers: { 'sec-fetch-site': 'same-origin' } }))
        assert.strictEqual(res.status, 400, query)
      }
      const post = yield* call(postJson('/api/s/password?password=correct%20horse', { token, password: 'correct horse' }))
      assert.strictEqual(post.status, 400)
      assert.isNull(post.headers.get('set-cookie'))
    })),
  )

  it.effect('a password link is 401 without the proof cookie and 200 with it; a revision change or revoke kills the cookie', () =>
    run(Effect.gen(function* () {
      const token = yield* share({ password: 'correct horse' })
      assert.deepStrictEqual([(yield* call(getContent(token))).status, json((yield* call(getContent(token))).text).error], [401, 'LinkPasswordRequired'])
      const proven = yield* call(postJson('/api/s/password', { token, password: 'correct horse' }))
      assert.strictEqual(proven.status, 200)
      assert.deepStrictEqual(json(proven.text), { ok: true, data: { verified: true } })
      const setCookie = proven.headers.get('set-cookie') ?? ''
      assert.match(setCookie, /^__Host-vizcad-share-[A-Za-z0-9-]+=v1\.\d+\.[A-Za-z0-9_-]+; Max-Age=43200; Path=\/; Secure; HttpOnly; SameSite=Lax$/)
      const cookie = cookieOf(proven.headers)
      assert.strictEqual((yield* call(getContent(token, { cookie }))).status, 200)

      yield* updateShareLink(caller('bob'), { ...ids, level: 'view' })
      yield* updateShareLink(caller('bob'), { ...ids, level: 'download' })
      assert.strictEqual((yield* call(getContent(token, { cookie }))).status, 401, 'revision moved on')
      const again = cookieOf((yield* call(postJson('/api/s/password', { token, password: 'correct horse' }))).headers)
      assert.strictEqual((yield* call(getContent(token, { cookie: again }))).status, 200)
      yield* revokeShareLink(caller('bob'), ids)
      assert.strictEqual((yield* call(getContent(token, { cookie: again }))).status, 404)
    })),
  )

  it.effect('unknown, malformed, expired links; the error says nothing about the file', () =>
    run(Effect.gen(function* () {
      const token = yield* share({ expiresAt: T0 + 60 })
      assert.strictEqual((yield* call(getContent('z'.repeat(43)))).status, 404)
      assert.strictEqual((yield* call(getContent('short'))).status, 404)
      yield* TestClock.adjust('2 minutes')
      const expired = yield* call(getContent(token))
      assert.deepStrictEqual([expired.status, json(expired.text).error, json(expired.text).sharer], [410, 'LinkExpired', 'BOB'])
      for (const secret of ['Bracket', 'f1', 'w/acme', token]) assert.notInclude(expired.text, secret)
    })),
  )
})

describe('GET /s/{token}/model', () => {
  it.effect('a download link: the bytes with the link headers, audited as a preview; a view link only the GLB', () =>
    run(Effect.gen(function* () {
      const token = yield* share()
      const res = yield* call(getContent(token, {}, 'model'))
      assert.deepStrictEqual([res.status, res.text], [200, CONTENT])
      assert.deepStrictEqual(
        ['content-type', 'x-content-type-options', 'content-security-policy', 'cache-control', 'referrer-policy'].map((n) => res.headers.get(n)),
        ['application/octet-stream', 'nosniff', 'sandbox', 'private, no-store', 'no-referrer'],
      )
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['link.created', 'file.previewed'])
      assert.strictEqual((yield* rows('securityLog')).length, 0)
      assert.strictEqual((yield* call(getContent(token, { 'sec-fetch-site': 'cross-site' }, 'model'))).status, 403)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/s/${token}/model?v=1`, { headers: { 'sec-fetch-site': 'same-origin' } }))).status, 400)
      yield* revokeShareLink(caller('bob'), ids)
      const view = yield* share({ level: 'view' })
      // D23: a view link previews, but a STEP without a derivative has nothing to show it; its source stays closed.
      assert.strictEqual((yield* call(getContent(view, {}, 'model'))).status, 404)
      yield* seedDerivative('f1', 'acme', glb())
      const glbRes = yield* call(getContent(view, {}, 'model'))
      assert.deepStrictEqual([glbRes.status, glbRes.headers.get('content-type'), glbRes.headers.get('referrer-policy')], [200, 'model/gltf-binary', 'no-referrer'])
      assert.strictEqual((yield* call(getContent(view, {}, 'content'))).status, 403)
    })),
  )
})

describe('POST /api/s/resolve and /api/s/password', () => {
  it.effect('resolve returns the file card for a live link and the gate for a password link', () =>
    run(Effect.gen(function* () {
      const open = yield* share()
      const card = yield* call(postJson('/api/s/resolve', { token: open }))
      assert.strictEqual(card.status, 200)
      assert.strictEqual(card.headers.get('referrer-policy'), 'no-referrer')
      assert.strictEqual(card.headers.get('cache-control'), 'private, no-store')
      assert.deepStrictEqual(json(card.text).data, {
        kind: 'file',
        file: {
          name: 'Bracket.step', extension: 'step', size: CONTENT.length, updatedAt: T0 - 3600, currentVersion: { number: 1 }, thumbnailAvailable: false,
          model: { kind: 'source', bytes: CONTENT.length, derivative: null, maxConvertBytes: 50 * 1024 * 1024 },
          can: { download: true, comment: false }, sharer: { displayName: 'BOB', workspaceLabel: 'Workspace acme' }, expiresAt: null,
        },
      })
      yield* revokeShareLink(caller('bob'), ids)
      const locked = yield* share({ password: 'correct horse' })
      const gate = yield* call(postJson('/api/s/resolve', { token: locked }))
      assert.deepStrictEqual(json(gate.text).data, { kind: 'password' })
      assert.notInclude(gate.text, 'Bracket')
    })),
  )

  it.effect('POST only, same origin, JSON; unknown fields and operations are refused', () =>
    run(Effect.gen(function* () {
      const token = yield* share()
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/s/resolve`, { method: 'GET' }))).status, 403)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token }, { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token }, { 'sec-fetch-site': 'cross-site' }))).status, 403)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token }, { 'content-type': 'text/plain' }))).status, 403)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token, extra: 1 }))).status, 400)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', {}))).status, 400)
      assert.strictEqual((yield* call(postJson('/api/s/password', { token, password: 'x', extra: 1 }))).status, 400)
      assert.strictEqual((yield* call(postJson('/api/s/other', { token }))).status, 404)
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token: 'nope' }))).status, 404)
    })),
  )

  it.effect('a wrong password is 401 with captchaRequired from the third failure; a Turnstile token then lets the right one in', () =>
    run(Effect.gen(function* () {
      const token = yield* share({ password: 'correct horse' })
      const wrong = (extra: Record<string, unknown> = {}) => call(postJson('/api/s/password', { token, password: 'guess guess guess', ...extra }))
      const flags: Array<unknown> = []
      for (let i = 0; i < 3; i++) {
        const res = yield* wrong()
        assert.deepStrictEqual([res.status, json(res.text).error], [401, 'LinkPasswordInvalid'])
        flags.push(json(res.text).captchaRequired)
        assert.isNull(res.headers.get('set-cookie'))
      }
      assert.deepStrictEqual(flags, [false, false, true])
      const needed = yield* wrong()
      assert.deepStrictEqual([needed.status, json(needed.text).error], [403, 'CaptchaFailed'])
      const rejected = yield* wrong({ turnstileToken: 'fail' })
      assert.strictEqual(rejected.status, 403)
      const ok = yield* call(postJson('/api/s/password', { token, password: 'correct horse', turnstileToken: 'ok' }))
      assert.strictEqual(ok.status, 200)
      assert.isNotEmpty(ok.headers.get('set-cookie') ?? '')
      for (const row of yield* rows('securityLog')) assert.notInclude(JSON.stringify(row), 'guess')
    })),
  )

  it.effect('a legacy-format token works through the same endpoints', () =>
    run(Effect.gen(function* () {
      const token = yield* seedLink('legacy', 'f1', 'acme', { expiresAt: T0 + 1000, legacyMaxExpiresAt: T0 + 1000 })
      assert.strictEqual((yield* call(postJson('/api/s/resolve', { token }))).status, 200)
      assert.strictEqual((yield* call(getContent(token))).status, 200)
    })),
  )
})

describe('GET /s/{token}/scene (Faz 5d)', () => {
  it.effect('JSON with the link headers; same origin only; no query string; a view link reads, never sees who wrote it', () =>
    run(Effect.gen(function* () {
      const view = yield* share({ level: 'view' })
      const empty = yield* call(getContent(view, {}, 'scene'))
      assert.strictEqual(empty.status, 200)
      assert.deepStrictEqual(JSON.parse(empty.text), { ok: true, data: { scene: null, previous: null, canEdit: false, maxViews: 20 } })
      assert.deepStrictEqual(['cache-control', 'referrer-policy', 'x-content-type-options'].map((n) => empty.headers.get(n)), ['private, no-store', 'no-referrer', 'nosniff'])
      assert.strictEqual((yield* call(getContent(view, { 'sec-fetch-site': 'cross-site' }, 'scene'))).status, 403)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/s/${view}/scene?x=1`, { headers: { 'sec-fetch-site': 'same-origin' } }))).status, 400)
      assert.strictEqual((yield* call(getContent('not-a-token', {}, 'scene'))).status, 404)
      // No audit row for the record itself.
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['link.created'])
    })),
  )
})
