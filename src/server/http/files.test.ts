import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { MemoryAuth, type SessionSummary } from '../services/Auth'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { glb, glbWith } from '../testing/glb'
import { png } from '../testing/images'
import { programLayer, rows, seedDerivative, seedFileGrant, seedMember, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
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
      const typed = { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-user': '?1' }
      assert.strictEqual((yield* call(get('/api/files/f1/content', typed))).status, 200)
      // `none` without a user-started navigation (a script, an embed, a prefetch) is refused.
      assert.strictEqual((yield* call(get('/api/files/f1/content', { 'sec-fetch-site': 'none' }))).status, 403)
      assert.strictEqual((yield* call(get('/api/files/f1/content', { ...typed, 'sec-fetch-mode': 'no-cors' }))).status, 403)
      assert.strictEqual((yield* call(get('/api/files/f1/content', { ...typed, 'sec-fetch-user': '?0' }))).status, 403)
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

describe('GET /api/files/{id}/model', () => {
  it.effect('200 with the content headers; audited as a preview, not as a download', () =>
    run(Effect.gen(function* () {
      const res = yield* call(get('/api/files/f1/model'))
      const content = yield* call(get('/api/files/f1/content', { cookie: 'session=tok-bob' }))
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.text, CONTENT)
      for (const name of ['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy', 'cache-control', 'accept-ranges', 'content-length'])
        assert.strictEqual(res.headers.get(name), content.headers.get(name), name)
      const access = yield* rows('accessLog')
      assert.deepStrictEqual(access.map((r) => [r.actorUserId, r.action]).sort(), [['bob', 'file.downloaded'], ['max', 'file.previewed']])
      assert.deepStrictEqual((yield* rows('securityLog')).map((r) => r.userId), ['bob'])
      const part = yield* call(get('/api/files/f1/model', { range: 'bytes=4-9' }))
      assert.deepStrictEqual([part.status, part.text], [206, CONTENT.slice(4, 10)])
    })),
  )

  it.effect('D23: every level previews; a STEP without derivative only for download; cross-site 403; only the current version', () =>
    run(Effect.gen(function* () {
      const guest = { cookie: 'session=tok-eve' }
      const status = (path: string, headers = guest) => call(get(path, headers)).pipe(Effect.map((r) => [r.status, r.status === 200 ? r.headers.get('content-type') : errorOf(r.text).error]))
      assert.deepStrictEqual(yield* status('/api/files/f1/model'), [404, 'ResourceUnavailable'], 'no grant: nothing about the file')
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      assert.deepStrictEqual(yield* status('/api/files/f1/model'), [404, 'PreviewUnavailable'], 'view, no derivative yet')
      const setLevel = (level: 'view' | 'comment' | 'download') =>
        Db.use((db) => db.use((d) => d.update(schema.fileAccess).set({ level }).where(eq(schema.fileAccess.userId, 'eve'))))
      yield* setLevel('comment')
      assert.deepStrictEqual(yield* status('/api/files/f1/model'), [404, 'PreviewUnavailable'])
      yield* setLevel('download')
      assert.deepStrictEqual(yield* status('/api/files/f1/model'), [200, 'application/octet-stream'], 'download: the source, converted in place')

      yield* seedDerivative('f1', 'acme', glb())
      for (const level of ['view', 'comment', 'download'] as const) {
        yield* setLevel(level)
        assert.deepStrictEqual(yield* status('/api/files/f1/model'), [200, 'model/gltf-binary'], level)
        assert.strictEqual((yield* call(get('/api/files/f1/content', guest))).status, level === 'download' ? 200 : 403, `content at ${level}`)
      }
      yield* setLevel('view')
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ extension: 'stl', name: 'Bracket.stl' }).where(eq(schema.files.id, 'f1'))))
      assert.deepStrictEqual(yield* status('/api/files/f1/model'), [200, 'application/octet-stream'], 'STL: the preview is the source (D23)')

      assert.strictEqual((yield* call(get('/api/files/f1/model', { 'sec-fetch-site': 'cross-site' }))).status, 403)
      assert.strictEqual((yield* call(get('/api/files/f1/model', { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(get('/api/files/f1/model?v=v1'))).status, 404)
      assert.strictEqual((yield* call(get('/api/files/f1/model?v=current'))).status, 200)
      assert.strictEqual((yield* call(get('/api/files/f1/model/extra'))).status, 404)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/files/f1/model`, { method: 'POST', headers: { cookie: 'session=tok-max', origin: ORIGIN, 'content-type': 'image/png' }, body: '{}' }))).status, 403)
    })),
  )
})

describe('/api/files/{id}/thumbnail', () => {
  const putRequest = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/files/f1/thumbnail?expect=${headers['x-expect'] ?? '1'}`, {
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
      // The version the image was rendered from (docs/11 5a note): missing or malformed is 400, an older one 409.
      assert.strictEqual((yield* call(putRequest(png(), { 'x-expect': '' }))).status, 400)
      assert.strictEqual((yield* call(putRequest(png(), { 'x-expect': 'one' }))).status, 400)
      const stale = yield* call(putRequest(png(), { 'x-expect': '2' }))
      assert.deepStrictEqual([stale.status, errorOf(stale.text).error], [409, 'VersionChanged'])
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

describe('POST /api/files/{id}/derivative/*', () => {
  const post = (step: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/files/f1/derivative/${step}`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { cookie: 'session=tok-bob', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers },
    })
  const stats = { converter: 'occt-import-js 0.0.23', triangles: 10, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 2, 3] } }

  it.effect('start, browser PUT, complete: the GLB becomes the model; failed records the code', () =>
    run(Effect.gen(function* () {
      const bytes = glb()
      const started = yield* call(post('start', { version: 1, size: bytes.byteLength }))
      assert.strictEqual(started.status, 200)
      assert.strictEqual(started.headers.get('cache-control'), 'private, no-store')
      const ticket = JSON.parse(started.text).data as { sessionId: string; url: string; headers: Record<string, string> }
      const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), bytes, ticket.headers)
      const done = yield* call(post('complete', { sessionId: ticket.sessionId, etag: put.etag, stats }))
      assert.deepStrictEqual([done.status, JSON.parse(done.text)], [200, { ok: true, data: { state: 'ready' } }])
      const model = yield* call(get('/api/files/f1/model'))
      assert.deepStrictEqual([model.status, model.headers.get('content-type'), [...model.bytes]], [200, 'model/gltf-binary', [...bytes]])
      const failed = yield* call(post('failed', { version: 1, code: 'corrupt' }))
      assert.deepStrictEqual([failed.status, JSON.parse(failed.text).data], [200, { state: 'ready' }], 'a stored derivative is kept')
    })),
  )

  it.effect('CSRF, session and body schema; GLB problems map to their statuses', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('start', { version: 1, size: 64 }, { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(post('start', { version: 1, size: 64 }, { 'content-type': 'text/plain' }))).status, 403)
      assert.strictEqual((yield* call(post('start', { version: 1, size: 64 }, { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(get('/api/files/f1/derivative/start', { cookie: 'session=tok-bob' }))).status, 403)
      assert.strictEqual((yield* call(post('other', {}))).status, 404)
      for (const body of [{ version: 1 }, { version: 0, size: 64 }, { version: 1, size: 64, key: 'w/acme/f/f1/mine.glb' }, { version: 1.5, size: 64 }]) {
        assert.strictEqual((yield* call(post('start', body))).status, 400, JSON.stringify(body))
      }
      for (const bad of [{ ...stats, converter: '' }, { ...stats, triangles: -1 }, { ...stats, nodes: 20_001 }, { ...stats, bbox: { min: [0, 0], max: [1, 1, 1] } }, { ...stats, extra: 1 }]) {
        assert.strictEqual((yield* call(post('complete', { sessionId: 's1', etag: 'e', stats: bad }))).status, 400, JSON.stringify(bad))
      }
      assert.strictEqual((yield* call(post('failed', { version: 1, code: 'network' }))).status, 400, 'network says nothing about the file')
      assert.strictEqual((yield* call(post('start', { version: 2, size: 64 }))).status, 409, 'VersionChanged')
      assert.strictEqual((yield* call(post('start', { version: 1, size: 64 }, { cookie: 'session=tok-max' }))).status, 403)

      const corrupt = glbWith(4, 1)
      const ticket = JSON.parse((yield* call(post('start', { version: 1, size: corrupt.byteLength }))).text).data as { sessionId: string; url: string; headers: Record<string, string> }
      const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), corrupt, ticket.headers)
      const refused = yield* call(post('complete', { sessionId: ticket.sessionId, etag: put.etag, stats }))
      assert.deepStrictEqual([refused.status, errorOf(refused.text).error], [422, 'InvalidDerivative'])
    })),
  )
})

describe('/api/files/{id}/scene', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/files/f1/scene`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { cookie: 'session=tok-bob', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers },
    })
  const scene = { v: 1, nodes: { '0.1': { color: '#b23a2e', at: 'Pump/Motor' } }, views: [] }

  it.effect('GET reads (same-origin only), POST writes with CSRF and the body schema; a stale revision is 409', () =>
    run(Effect.gen(function* () {
      yield* seedDerivative('f1', 'acme', glb())
      const empty = yield* call(get('/api/files/f1/scene'))
      assert.deepStrictEqual([empty.status, JSON.parse(empty.text).data], [200, { scene: null, previous: null, canEdit: false, maxViews: 20 }])
      assert.strictEqual((yield* call(get('/api/files/f1/scene', { 'sec-fetch-site': 'cross-site' }))).status, 403)
      const written = yield* call(post({ version: 1, revision: 0, body: scene }))
      assert.deepStrictEqual([written.status, JSON.parse(written.text).data], [200, { revision: 1, updatedAt: T0 }])
      const read = JSON.parse((yield* call(get('/api/files/f1/scene'))).text).data
      assert.deepStrictEqual([read.scene.revision, read.scene.body], [1, scene])
      const stale = yield* call(post({ version: 1, revision: 0, body: scene }))
      assert.deepStrictEqual([stale.status, errorOf(stale.text).error], [409, 'SceneConflict'])
      assert.strictEqual((yield* call(post({ version: 1, revision: 1, body: scene }, { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(post({ version: 1, revision: 1, body: scene }, { cookie: 'session=tok-max' }))).status, 403, 'a member without edit')
      for (const bad of [{ version: 1, revision: 1 }, { version: 1, revision: -1, body: scene }, { version: 1, revision: 1, body: { ...scene, v: 2 } }, { version: 1, revision: 1, body: scene, extra: 1 }]) {
        assert.strictEqual((yield* call(post(bad))).status, 400, JSON.stringify(bad))
      }
      assert.strictEqual((yield* call(post({ version: 2, revision: 1, body: scene }))).status, 409, 'VersionChanged')
      // A saved view may keep the part opened alone: a node path, nothing else.
      const view = { id: 'v1', name: 'Motor', camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], fov: 35 } }
      assert.strictEqual((yield* call(post({ version: 1, revision: 1, body: { ...scene, views: [{ ...view, isolated: '0.1' }] } }))).status, 200)
      assert.strictEqual((yield* call(post({ version: 1, revision: 2, body: { ...scene, views: [{ ...view, isolated: 'motor' }] } }))).status, 400)
      assert.strictEqual((yield* call(new Request(`${ORIGIN}/api/files/f1/scene`, { method: 'PUT', headers: { cookie: 'session=tok-bob' } }))).status, 404)
    })),
  )

  it.effect('the request cap counts UTF-8 bytes: a body under the stored character limit in Turkish or CJK names is accepted', () =>
    run(Effect.gen(function* () {
      yield* seedDerivative('f1', 'acme', glb())
      // About 121 000 characters, most of them three UTF-8 bytes each: ~340 KB on the wire, under 128 Ki characters stored.
      const nodes = Object.fromEntries(Array.from({ length: 550 }, (_, i) => [`0.${i}`, { name: '部品'.repeat(100) }]))
      const wide = yield* call(post({ version: 1, revision: 0, body: { v: 1, nodes, views: [] } }))
      assert.strictEqual(wide.status, 200)
      const over = Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`0.${i}`, { name: '部品'.repeat(100) }]))
      assert.strictEqual((yield* call(post({ version: 1, revision: 1, body: { v: 1, nodes: over, views: [] } }))).status, 413)
    })),
  )
})
