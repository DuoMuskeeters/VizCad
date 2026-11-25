import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { MemoryAuth, type SessionSummary } from '../services/Auth'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { Storage } from '../services/Storage'
import { png } from '../testing/images'
import { programLayer, rows, seedFileGrant, seedMember, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { type FilesServices, filesResponse } from './files'

const ORIGIN = 'https://vizcad.test'
const meta = { requestId: 'ray-1' }
const CONTENT = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'

const session = (userId: string): SessionSummary => ({
  sessionId: `s-${userId}`, userId, name: userId, email: `${userId}@example.com`, emailVerified: true, accountStatus: 'active', activeWorkspaceId: null,
})

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: 'GET', headers: { cookie: 'session=tok-max', 'sec-fetch-site': 'same-origin', 'cf-ray': 'ray-1', ...headers } })

const call = (request: Request) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<FilesServices>()
    const response = yield* filesResponse(request, Layer.succeedContext(context), meta)
    const bytes = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))
    const text = new TextDecoder().decode(bytes)
    return { status: response.status, headers: response.headers, bytes, text }
  })

const errorOf = (text: string) => (JSON.parse(text) as { error?: string; reason?: string })

const run = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(
    Effect.andThen(Effect.gen(function* () {
      for (const id of ['bob', 'max', 'eve', 'zed']) yield* seedUser(id)
      yield* seedWorkspace('acme', 'bob')
      yield* seedMember('acme', 'max', 'member')
      yield* seedMember('acme', 'eve', 'guest')
      yield* seedWorkspace('beta', 'zed')
      yield* seedStoredFile('f1', 'bob', 'acme', CONTENT, { name: 'Bracket.step' })
      yield* Ref.update(yield* MemoryAuth, (s) => ({
        ...s, sessions: new Map([['tok-max', session('max')], ['tok-bob', session('bob')], ['tok-eve', session('eve')], ['tok-zed', session('zed')]]),
      }))
    })),
    Effect.andThen(body),
    Effect.provide(programLayer({ ...defaultPlan })),
  )

describe('GET /api/files/{id}/content', () => {
  it.effect('200 with the safe headers for a member', () =>
    run(Effect.gen(function* () {
      const res = yield* call(get('/api/files/f1/content'))
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.text, CONTENT)
      assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream')
      assert.strictEqual(res.headers.get('content-disposition'), `attachment; filename="Bracket.step"; filename*=UTF-8''Bracket.step`)
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff')
      assert.strictEqual(res.headers.get('content-security-policy'), 'sandbox')
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store')
      assert.strictEqual(res.headers.get('accept-ranges'), 'bytes')
      assert.strictEqual(res.headers.get('content-length'), String(CONTENT.length))
    })),
  )

  it.effect('206 for a Range with Content-Range and the same safe headers; 416 past the end', () =>
    run(Effect.gen(function* () {
      const res = yield* call(get('/api/files/f1/content', { range: 'bytes=4-9' }))
      assert.strictEqual(res.status, 206)
      assert.strictEqual(res.text, CONTENT.slice(4, 10))
      assert.strictEqual(res.headers.get('content-range'), `bytes 4-9/${CONTENT.length}`)
      assert.strictEqual(res.headers.get('content-length'), '6')
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff')
      assert.strictEqual(res.headers.get('content-security-policy'), 'sandbox')
      const past = yield* call(get('/api/files/f1/content', { range: 'bytes=9999-' }))
      assert.strictEqual(past.status, 416)
      assert.strictEqual(past.headers.get('content-range'), `bytes */${CONTENT.length}`)
    })),
  )

  it.effect('refuses a cross-site or same-site request before the session is read, and writes no audit row', () =>
    run(Effect.gen(function* () {
      for (const site of ['cross-site', 'same-site']) {
        const res = yield* call(get('/api/files/f1/content', { 'sec-fetch-site': site }))
        assert.deepStrictEqual([res.status, errorOf(res.text).error], [403, 'CsrfRejected'], site)
      }
      assert.strictEqual((yield* rows('accessLog')).length, 0)
      assert.strictEqual((yield* rows('securityLog')).length, 0)
    })),
  )

  it.effect('accepts a user-typed URL (none) and, without the header, only a trusted Origin', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(get('/api/files/f1/content', { 'sec-fetch-site': 'none' }))).status, 200)
      const headers = { cookie: 'session=tok-max', 'cf-ray': 'ray-1' }
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/files/f1/content`, { headers: { ...headers, origin: ORIGIN } }))).status, 200)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/files/f1/content`, { headers: { ...headers, origin: 'https://evil.test' } }))).status, 403)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/files/f1/content`, { headers }))).status, 403)
    })),
  )

  it.effect('401 without a session; 404 for strangers, other workspaces, unknown files, paths and versions', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(get('/api/files/f1/content', { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(get('/api/files/f1/content', { cookie: 'session=tok-zed' }))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/nope/content'))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/f1/other'))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/f1/content/extra'))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/f1/content?v=nope'))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/f1/content?v=a%2F..%2Fb'))).status, 400)
      assert.strictEqual((yield* call(get('/api/files/f%2Fx/content'))).status, 404)
    })),
  )

  it.effect('a guest follows their grant: no grant 404, view 403, download 200; errors carry no key or e-mail', () =>
    run(Effect.gen(function* () {
      const guest = { cookie: 'session=tok-eve' }
      assert.strictEqual((yield* call(get('/api/files/f1/content', guest))).status, 404)
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      const denied = yield* call(get('/api/files/f1/content', guest))
      assert.deepStrictEqual([denied.status, errorOf(denied.text)], [403, { ok: false, error: 'PermissionDenied', reason: 'INSUFFICIENT_LEVEL' }])
      for (const secret of ['w/acme', 'example.com', 'obj-f1']) assert.notInclude(denied.text, secret)
      yield* Db.use((db) => db.use((d) => d.update(schema.fileAccess).set({ level: 'download' }).where(eq(schema.fileAccess.userId, 'eve'))))
      assert.strictEqual((yield* call(get('/api/files/f1/content', guest))).status, 200)
    })),
  )

  it.effect('409 when the object no longer matches, and nothing of it is sent', () =>
    run(Effect.gen(function* () {
      const key = (yield* rows('files'))[0]?.r2Key ?? ''
      yield* (yield* Storage).put(key, 'swapped!'.padEnd(CONTENT.length, '?'))
      const res = yield* call(get('/api/files/f1/content'))
      assert.deepStrictEqual([res.status, errorOf(res.text).error], [409, 'ContentIntegrity'])
      assert.notInclude(res.text, 'swapped')
    })),
  )

  it.effect('POST is not a download', () =>
    run(Effect.gen(function* () {
      const res = yield* call(new Request(`${ORIGIN}/api/files/f1/content`, { method: 'POST', headers: { cookie: 'session=tok-max', origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }))
      assert.strictEqual(res.status, 403)
    })),
  )
})

describe('/api/files/{id}/thumbnail', () => {
  const putRequest = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/files/f1/thumbnail`, {
      method: 'POST', body,
      headers: { cookie: 'session=tok-bob', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'image/png', ...headers },
    })

  it.effect('POST stores a PNG, GET serves it as image/png with the safe headers', () =>
    run(Effect.gen(function* () {
      const stored = yield* call(putRequest(png()))
      assert.deepStrictEqual([stored.status, JSON.parse(stored.text)], [200, { ok: true, data: { thumbnailAvailable: true } }])
      const res = yield* call(get('/api/files/f1/thumbnail'))
      assert.strictEqual(res.status, 200)
      assert.deepStrictEqual([...res.bytes], [...png()])
      assert.strictEqual(res.headers.get('content-type'), 'image/png')
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff')
      assert.strictEqual(res.headers.get('content-security-policy'), 'sandbox')
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store')
      assert.strictEqual((yield* call(get('/api/files/f1/thumbnail', { 'sec-fetch-site': 'cross-site' }))).status, 403)
    })),
  )

  it.effect('POST needs a trusted Origin, same-origin fetch and an image content type; the body is capped and validated', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(putRequest(png(), { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(putRequest(png(), { 'sec-fetch-site': 'cross-site' }))).status, 403)
      assert.strictEqual((yield* call(putRequest(png(), { 'content-type': 'application/json' }))).status, 403)
      assert.strictEqual((yield* call(putRequest(png(), { 'content-type': 'text/html' }))).status, 403)
      assert.strictEqual((yield* call(putRequest(png(), { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(putRequest(new Uint8Array(1024 * 1024 + 1)))).status, 413)
      const broken = yield* call(putRequest(new TextEncoder().encode('<svg onload=alert(1)>')))
      assert.deepStrictEqual([broken.status, errorOf(broken.text).error], [422, 'InvalidThumbnail'])
      assert.strictEqual((yield* call(putRequest(png(), { cookie: 'session=tok-max' }))).status, 403, 'a member who is not the uploader')
      assert.strictEqual((yield* call(putRequest(png(), { cookie: 'session=tok-zed' }))).status, 404)
      const [file] = yield* rows('files')
      assert.isNull(file?.thumbnailR2Key)
    })),
  )

  it.effect('GET without a stored thumbnail is 404', () =>
    run(Effect.gen(function* () {
      const res = yield* call(get('/api/files/f1/thumbnail'))
      assert.deepStrictEqual([res.status, errorOf(res.text).error], [404, 'PreviewUnavailable'])
    })),
  )
})
