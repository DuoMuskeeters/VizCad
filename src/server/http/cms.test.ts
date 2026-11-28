import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { CacheError } from '../errors'
import { MAX_ATTEMPTS } from '../programs/cachePurges'
import * as AppConfig from '../services/AppConfig'
import * as Auth from '../services/Auth'
import { CachePurges, memoryWith, type MemoryOptions } from '../services/Cache'
import { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import * as RateLimit from '../services/RateLimit'
import * as Storage from '../services/Storage'
import { seedAuthor } from '../testing/blog'
import { pngBytes, svgBytes } from '../testing/cmsImages'
import { rows, seedUser, T0 } from '../testing/fixtures'
import { fromUnixSeconds } from '../time'
import { type CmsServices, cmsOperationNames, cmsResponse } from './cms'
import { STATUS } from './respond'

const ORIGIN = 'https://vizcad.test'
const meta = { requestId: 'ray-1' }

const post = (operation: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${ORIGIN}/api/cms/${operation}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'session=tok-admin', 'cf-ray': 'ray-1', 'cf-connecting-ip': '203.0.113.9', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

const session = (userId: string, overrides: Partial<Auth.SessionSummary> = {}): Auth.SessionSummary => ({
  sessionId: `s-${userId}`, userId, name: userId, email: `${userId}@example.com`, emailVerified: true, accountStatus: 'active', platformRole: 'admin', activeWorkspaceId: null, ...overrides,
})

const layer = (cache: MemoryOptions, config: Partial<AppConfig.AppConfig['Service']>) =>
  Layer.mergeAll(DbMemory.memory, Auth.memory, RateLimit.memory, memoryWith(cache), Storage.memory).pipe(Layer.provideMerge(AppConfig.test(config)))

const call = (request: Request) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<CmsServices>()
    const response = yield* cmsResponse(request, Layer.succeedContext(context), meta)
    const body = yield* Effect.promise(() => response.json() as Promise<{ ok: boolean; data?: unknown; error?: string; reason?: string; fields?: Array<string>; field?: string; max?: number }>)
    return { status: response.status, body, headers: response.headers }
  })

const run = <A, E, R>(body: Effect.Effect<A, E, R>, cache: MemoryOptions = {}, config: Partial<AppConfig.AppConfig['Service']> = {}) =>
  TestClock.setTime(T0 * 1000).pipe(
    Effect.andThen(Effect.gen(function* () {
      const auth = yield* Auth.MemoryAuth
      yield* Ref.update(auth, (s) => ({
        ...s,
        sessions: new Map([
          ['tok-admin', session('admin')],
          ['tok-user', session('user', { platformRole: 'user' })],
          ['tok-unverified', session('unverified', { emailVerified: false })],
          ['tok-suspended', session('suspended', { accountStatus: 'suspended' })],
        ]),
      }))
    })),
    Effect.andThen(body),
    Effect.provide(layer(cache, config)),
  )

const purgeCalls = CachePurges.use(Ref.get)

describe('POST /api/cms/<operation>', () => {
  it('has exactly the operations of 6a (cache), 6c-1 (posts) and 6c-2 (authors, images, failed purges)', () => {
    assert.deepStrictEqual([...cmsOperationNames].sort(), [
      'archivePost', 'assetUsage', 'clearPurges', 'createPost', 'deleteAsset', 'deleteAuthor', 'deletePost', 'drainPurges', 'getPostAdmin',
      'listAssets', 'listAuthors', 'listPostsAdmin', 'listPurges', 'previewDraft', 'publishTranslation', 'purgeHost', 'purgeUrls',
      'restorePost', 'retryPurges', 'saveAuthor', 'saveDraft', 'unpublishTranslation', 'updateAssetAlt', 'updatePostMeta',
    ])
  })

  it.effect('unknown operations (including prototype keys) are 404, before CSRF and session', () =>
    run(Effect.gen(function* () {
      for (const name of ['nope', 'toString', '__proto__', 'hasOwnProperty', 'listPurges/extra', '']) {
        assert.strictEqual((yield* call(post(name, {}, { cookie: '', origin: 'https://evil.test' }))).status, 404, name)
      }
    })))

  it.effect('CSRF: GET, foreign origin, cross-site fetch and form bodies are refused before the session is read', () =>
    run(Effect.gen(function* () {
      for (const [request, label] of [
        [post('listPurges', {}, {}, 'GET'), 'GET'],
        [post('listPurges', {}, { origin: 'https://evil.test' }), 'origin'],
        [post('listPurges', {}, { origin: '' }), 'no origin'],
        [post('listPurges', {}, { 'sec-fetch-site': 'cross-site' }), 'fetch-site'],
        [post('listPurges', {}, { 'content-type': 'text/plain' }), 'content-type'],
      ] as const) {
        const { status, body } = yield* call(request)
        assert.strictEqual(status, 403, label)
        assert.strictEqual(body.error, 'CsrfRejected', label)
      }
    })))

  it.effect('a trusted extra origin passes the CSRF check', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listPurges', {}, { origin: 'http://localhost:5173' }))).status, 200)
    }), {}, { trustedOrigins: new Set([ORIGIN, 'http://localhost:5173']) }))

  it.effect('no session is 401, a suspended account is 401; a non-admin and an unverified admin are 403', () =>
    run(Effect.gen(function* () {
      for (const name of cmsOperationNames) {
        assert.strictEqual((yield* call(post(name, {}, { cookie: '' }))).status, 401, `${name} anonymous`)
        assert.strictEqual((yield* call(post(name, {}, { cookie: 'session=tok-suspended' }))).status, 401, `${name} suspended`)
        const user = yield* call(post(name, {}, { cookie: 'session=tok-user' }))
        assert.strictEqual(user.status, 403, `${name} non-admin`)
        assert.strictEqual(user.body.error, 'PermissionDenied')
        assert.isUndefined(user.body.reason, 'the denial reason stays a server diagnostic')
        assert.strictEqual((yield* call(post(name, {}, { cookie: 'session=tok-unverified' }))).status, 403, `${name} unverified`)
      }
      assert.deepStrictEqual(yield* purgeCalls, [], 'no denied request reached the cache API')
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })))

  it.effect('bodies are schema-checked: extra fields, wrong types, bad JSON and oversized lists are 400', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listPurges', { limit: 0 }))).status, 400)
      assert.strictEqual((yield* call(post('listPurges', { limit: 201 }))).status, 400)
      assert.strictEqual((yield* call(post('listPurges', { extra: 1 }))).status, 400)
      assert.strictEqual((yield* call(post('drainPurges', { force: true }))).status, 400)
      assert.strictEqual((yield* call(post('purgeHost', { hostname: 'viz-cad.com' }))).status, 400, 'no other host can be named')
      assert.strictEqual((yield* call(post('purgeHost', []))).status, 400)
      assert.strictEqual((yield* call(post('purgeHost', null))).status, 400)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: [] }))).status, 400)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: 'https://vizcad.test/' }))).status, 400)
      const many = Array.from({ length: 101 }, (_, i) => `${ORIGIN}/blog/p${i}`)
      assert.strictEqual((yield* call(post('purgeUrls', { urls: many }))).status, 400)
      const bad = new Request(`${ORIGIN}/api/cms/listPurges`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'session=tok-admin' }, body: '{' })
      assert.strictEqual((yield* call(bad)).status, 400)
    })))

  it.effect('listPurges: the queue with counts and the configured flag, private and no-store', () =>
    run(Effect.gen(function* () {
      const db = yield* Db
      yield* db.use((d) =>
        d.insert(schema.cachePurges).values([
          { kind: 'url', target: `${ORIGIN}/`, reason: 'publish', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0 + 60) },
          { kind: 'host', target: 'vizcad.test', reason: 'texts', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0), attempts: MAX_ATTEMPTS, lastError: 'rate-limited' },
        ]),
      )
      const { status, body, headers } = yield* call(post('listPurges', {}))
      assert.strictEqual(status, 200)
      assert.strictEqual(headers.get('cache-control'), 'private, no-store')
      const data = body.data as { configured: boolean; total: number; failed: number; rows: Array<{ kind: string; target: string; notBefore: number; failed: boolean; lastError: string | null }> }
      assert.isTrue(data.configured)
      assert.strictEqual(data.total, 2)
      assert.strictEqual(data.failed, 1)
      assert.deepStrictEqual(data.rows.map((r) => [r.kind, r.notBefore, r.failed, r.lastError]), [['host', T0, true, 'rate-limited'], ['url', T0 + 60, false, null]])
      const limited = yield* call(post('listPurges', { limit: 1 }))
      assert.strictEqual((limited.body.data as { rows: unknown[] }).rows.length, 1)
    })))

  it.effect('purgeUrls queues each URL now and +60 s, purges the due ones in one API call and leaves the late ones queued', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeUrls', { urls: [`${ORIGIN}/`, `${ORIGIN}/blog`, `${ORIGIN}/blog`, `${ORIGIN}/tr`] }))
      assert.strictEqual(status, 200)
      const data = body.data as { urls: number; purge: { done: number; queued: number; calls: number } }
      assert.strictEqual(data.urls, 3)
      assert.deepStrictEqual(data.purge, { done: 3, failed: 0, dropped: 0, queued: 3, calls: 1 } as unknown as typeof data.purge)
      assert.deepStrictEqual(yield* purgeCalls, [{ kind: 'url', urls: [`${ORIGIN}/`, `${ORIGIN}/blog`, `${ORIGIN}/tr`] }])
      // The late purge waits for the drain (admin screen or cron).
      yield* TestClock.adjust('61 seconds')
      const drained = yield* call(post('drainPurges', {}))
      assert.strictEqual(drained.status, 200)
      assert.deepStrictEqual((drained.body.data as { purge: { done: number; queued: number } }).purge, { done: 3, failed: 0, dropped: 0, queued: 0, calls: 1 } as never)
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
    })))

  it.effect('purgeUrls refuses URLs off the site, with a query, or outside the cached pages, and queues nothing', () =>
    run(Effect.gen(function* () {
      for (const url of ['https://viz-cad.com/', 'http://vizcad.test/', 'https://vizcad.test/?utm=x', 'https://vizcad.test/#a', 'https://vizcad.test/app', 'https://vizcad.test/api/cms/listPurges', '/blog', 'not a url']) {
        const { status, body } = yield* call(post('purgeUrls', { urls: [`${ORIGIN}/blog`, url] }))
        assert.strictEqual(status, 400, url)
        assert.strictEqual(body.error, 'ValidationError', url)
      }
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
      assert.deepStrictEqual(yield* purgeCalls, [])
    })))

  it.effect('purgeHost purges the site hostname only, in one API call', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeHost', {}))
      assert.strictEqual(status, 200)
      assert.strictEqual((body.data as { hostname: string }).hostname, 'vizcad.test')
      assert.deepStrictEqual(yield* purgeCalls, [{ kind: 'host', hostname: 'vizcad.test' }])
      assert.deepStrictEqual((yield* rows('cachePurges')).map((r) => r.kind), ['host'], 'the late +60 s row stays queued')
    })))

  it.effect('a failed purge is reported in the summary and stays queued for the retry', () =>
    run(Effect.gen(function* () {
      const { status, body } = yield* call(post('purgeHost', {}))
      assert.strictEqual(status, 200)
      const purge = (body.data as { purge: { done: number; failed: number } }).purge
      assert.strictEqual(purge.done, 0)
      assert.strictEqual(purge.failed, 1)
      assert.strictEqual((yield* rows('cachePurges')).length, 1, 'the failed row merged into the +60 s row')
    }), { fail: () => new CacheError({ reason: 'rate-limited' }) }))

  it.effect('without purge config (K5 open) every write is CacheError 502 and nothing is queued; listing still works', () =>
    run(Effect.gen(function* () {
      for (const [name, body] of [['drainPurges', {}], ['purgeHost', {}], ['purgeUrls', { urls: [`${ORIGIN}/`] }]] as const) {
        const response = yield* call(post(name, body))
        assert.strictEqual(response.status, 502, name)
        assert.strictEqual(response.body.error, 'CacheError', name)
      }
      assert.deepStrictEqual(yield* rows('cachePurges'), [])
      const list = yield* call(post('listPurges', {}))
      assert.isFalse((list.body.data as { configured: boolean }).configured)
    }), { configured: false }))

  it.effect('writes are rate limited per admin (cmsWrite); reads are not', () =>
    run(Effect.gen(function* () {
      const statuses = []
      for (let i = 0; i < 3; i++) statuses.push((yield* call(post('drainPurges', {}))).status)
      assert.deepStrictEqual(statuses, [200, 200, 429])
      assert.strictEqual((yield* call(post('listPurges', {}))).status, 200)
    }), {}, { rateLimits: { ...AppConfig.defaultRateLimits, cmsWrite: { target: { limit: 2, windowSeconds: 3600 }, ip: { limit: 100, windowSeconds: 3600 } } } }))

  it.effect('posts over HTTP: create, save, publish; editor hints (PublishBlocked reason and fields, TextTooLong field) reach the client', () =>
    run(Effect.gen(function* () {
      yield* seedAuthor('admin')
      const created = yield* call(post('createPost', { title: 'Hello' }))
      assert.strictEqual(created.status, 200)
      const { postId, revision } = created.body.data as { postId: string; revision: number }
      const fields = { slug: 'Bad Slug', title: 'Hello', excerpt: '', contentMd: 'Body', metaTitle: null, metaDescription: null, keywords: [], coverAlt: null, ogAssetId: null }
      const saved = yield* call(post('saveDraft', { postId, locale: 'en', fields, revision }))
      assert.strictEqual(saved.status, 200)
      const next = (saved.body.data as { revision: number }).revision
      const blocked = yield* call(post('publishTranslation', { postId, locale: 'en', revision: next }))
      assert.strictEqual(blocked.status, 422)
      assert.deepInclude(blocked.body, { error: 'PublishBlocked', reason: 'invalid-fields', fields: ['slug', 'excerpt'] })
      const stale = yield* call(post('saveDraft', { postId, locale: 'en', fields, revision }))
      assert.strictEqual(stale.status, 409)
      assert.strictEqual(stale.body.error, 'ContentConflict')
      const long = yield* call(post('saveDraft', { postId, locale: 'en', fields: { ...fields, title: 'x'.repeat(121) }, revision: next }))
      assert.strictEqual(long.status, 422)
      assert.deepInclude(long.body, { error: 'TextTooLong', field: 'title', max: 120 })
      const good = yield* call(post('saveDraft', { postId, locale: 'en', fields: { ...fields, slug: 'hello', excerpt: 'x' }, revision: next }))
      const live = yield* call(post('publishTranslation', { postId, locale: 'en', revision: (good.body.data as { revision: number }).revision }))
      assert.strictEqual(live.status, 200)
      assert.deepStrictEqual((live.body.data as { urls: string[] }).urls, ['/blog/hello'])
      const closed = yield* call(post('publishTranslation', { postId, locale: 'tr', revision: 0 }))
      assert.deepInclude(closed.body, { error: 'PublishBlocked', reason: 'locale-closed' })
      assert.strictEqual((yield* call(post('getPostAdmin', { postId: 'missing' }))).status, 404)
    })))

  it.effect('post bodies: a draft may carry its markdown (up to 192 KiB), other operations stay at 16 KiB; unknown locales are 400', () =>
    run(Effect.gen(function* () {
      const fields = { slug: 's', title: 't', excerpt: '', contentMd: 'x'.repeat(40 * 1024), metaTitle: null, metaDescription: null, keywords: [], coverAlt: null, ogAssetId: null }
      // Over the content limit but under the body cap: the program answers TextTooLong (shown under the field).
      const big = yield* call(post('saveDraft', { postId: 'p', locale: 'en', fields, revision: 0 }))
      assert.strictEqual(big.status, 422)
      assert.strictEqual(big.body.error, 'TextTooLong')
      assert.strictEqual((yield* call(post('saveDraft', { postId: 'p', locale: 'en', fields: { ...fields, contentMd: 'x'.repeat(200 * 1024) }, revision: 0 }))).status, 413)
      assert.strictEqual((yield* call(post('createPost', { title: 'x'.repeat(20 * 1024) }))).status, 413)
      assert.strictEqual((yield* call(post('previewDraft', { postId: 'p', locale: 'xx' }))).status, 400)
      assert.strictEqual((yield* call(post('saveDraft', { postId: 'p', locale: 'en', fields: { ...fields, extra: 1 }, revision: 0 }))).status, 400)
    })))

  it('every error the dispatcher can raise has a status', () => {
    for (const tag of ['ValidationError', 'PayloadTooLarge', 'CsrfRejected', 'Unauthenticated', 'PermissionDenied', 'RateLimitExceeded', 'RateLimitError', 'CacheError', 'DbError', 'ConfigError', 'AuthError', 'ResourceUnavailable', 'ContentConflict', 'SlugConflict', 'PublishBlocked', 'TextTooLong', 'AssetUnavailable', 'PostUnavailable', 'AuthorUnavailable', 'AssetInUse', 'InvalidAsset', 'AuthorHasPosts', 'UnsupportedFileType', 'StorageError'] as const) {
      assert.isNumber(STATUS[tag], tag)
    }
  })

  const upload = (bytes: Uint8Array, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/cms/assets`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', origin: ORIGIN, cookie: 'session=tok-admin', 'cf-ray': 'ray-1', 'cf-connecting-ip': '203.0.113.9', ...headers },
      body: bytes.slice(),
    })

  it.effect('POST /api/cms/assets: an admin uploads image bytes; CSRF, session, admin and type checks come first', () =>
    run(Effect.gen(function* () {
      yield* seedUser('admin')
      const ok = yield* call(upload(pngBytes(640, 360)))
      assert.strictEqual(ok.status, 200)
      const data = ok.body.data as { asset: { id: string; url: string; width: number }; duplicate: boolean }
      assert.match(data.asset.url, /^\/api\/blog\/image\/blog%2Fa%2F[0-9A-Z]{26}\.png$/)
      assert.strictEqual(data.asset.width, 640)
      assert.isTrue(((yield* call(upload(pngBytes(640, 360)))).body.data as { duplicate: boolean }).duplicate)
      // SVG passes CSRF (its own type) and is refused by its bytes; a PNG sent as octet-stream is judged by its bytes.
      const svg = yield* call(upload(svgBytes, { 'content-type': 'image/svg+xml' }))
      assert.deepStrictEqual([svg.status, svg.body.error], [415, 'UnsupportedFileType'])
      assert.strictEqual((yield* call(upload(pngBytes(10, 10, 3), { 'content-type': 'application/octet-stream' }))).status, 200)
      assert.deepStrictEqual([(yield* call(upload(pngBytes(9000, 10)))).status], [422])
      // Form-encodable types never reach the program (CSRF), nor do other origins, anonymous or non-admin callers.
      assert.strictEqual((yield* call(upload(pngBytes(10, 10), { 'content-type': 'text/plain' }))).status, 403)
      assert.strictEqual((yield* call(upload(pngBytes(10, 10), { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(upload(pngBytes(10, 10), { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(upload(pngBytes(10, 10), { cookie: 'session=tok-user' }))).status, 403)
      // Over 5 MB: refused before the body is buffered.
      const big = new Uint8Array(5 * 1024 * 1024 + 1)
      big.set(pngBytes(10, 10))
      assert.strictEqual((yield* call(upload(big))).status, 413)
      assert.strictEqual((yield* rows('cmsAssets')).length, 2)
    })))

  it.effect('images over HTTP: list, usage, alt, and delete refused while used (409 with the places)', () =>
    run(Effect.gen(function* () {
      yield* seedUser('admin')
      const id = ((yield* call(upload(pngBytes(64, 64)))).body.data as { asset: { id: string } }).asset.id
      const list = yield* call(post('listAssets', {}))
      assert.deepStrictEqual((list.body.data as { rows: Array<{ id: string; inUse: boolean }> }).rows.map((r) => [r.id, r.inUse]), [[id, false]])
      assert.strictEqual((yield* call(post('updateAssetAlt', { assetId: id, alt: 'Gear' }))).status, 200)
      const db = yield* Db
      yield* db.use((d) => d.insert(schema.siteSettings).values({ key: 'organization.logoAssetId', value: id, updatedAt: fromUnixSeconds(T0) }))
      assert.deepStrictEqual(((yield* call(post('assetUsage', { assetId: id }))).body.data as { places: string[] }).places, ['setting'])
      const refused = yield* call(post('deleteAsset', { assetId: id }))
      assert.deepInclude(refused.body, { error: 'AssetInUse', fields: ['setting'] })
      assert.strictEqual(refused.status, 409)
      yield* db.use((d) => d.delete(schema.siteSettings))
      assert.strictEqual((yield* call(post('deleteAsset', { assetId: id }))).status, 200)
    })))

  it.effect('authors over HTTP: list, create, update, delete refused with posts (409)', () =>
    run(Effect.gen(function* () {
      yield* seedAuthor('ada')
      const list = (yield* call(post('listAuthors', {}))).body.data as { rows: Array<{ id: string; revision: number }> }
      const row = list.rows[0]
      const saved = yield* call(post('saveAuthor', { authorId: row?.id, userId: 'ada', name: 'Ada', slug: 'ada', avatarAssetId: null, sameAs: ['https://ada.dev'], translations: { tr: { bio: 'Merhaba', jobTitle: null } }, revision: row?.revision }))
      assert.strictEqual(saved.status, 200)
      assert.strictEqual((yield* call(post('saveAuthor', { userId: 'ada', name: 'Ada', slug: 'ada', avatarAssetId: null, sameAs: [], translations: { xx: {} }, revision: 0 }))).status, 400)
      const db = yield* Db
      yield* db.use((d) => d.insert(schema.posts).values({ id: 'p1', slug: 'p', title: 't', excerpt: '', content: '', category: 'g', readTime: 1, status: 'draft', authorId: 'ada', createdAt: fromUnixSeconds(T0), updatedAt: fromUnixSeconds(T0) }))
      const refused = yield* call(post('deleteAuthor', { authorId: row?.id }))
      assert.deepStrictEqual([refused.status, refused.body.error], [409, 'AuthorHasPosts'])
    })))

  it.effect('retryPurges and clearPurges touch only rows out of retries', () =>
    run(Effect.gen(function* () {
      const db = yield* Db
      yield* db.use((d) =>
        d.insert(schema.cachePurges).values([
          { kind: 'url', target: `${ORIGIN}/blog`, reason: 'publish', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0), attempts: MAX_ATTEMPTS, lastError: 'api-error' },
          { kind: 'url', target: `${ORIGIN}/faq`, reason: 'publish', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0), attempts: MAX_ATTEMPTS, lastError: 'api-error' },
          { kind: 'url', target: `${ORIGIN}/pricing`, reason: 'publish', createdAt: fromUnixSeconds(T0), notBefore: fromUnixSeconds(T0 + 30), attempts: 2, lastError: 'api-error' },
        ]),
      )
      const ids = (yield* rows('cachePurges')).map((r) => r.id)
      const retried = yield* call(post('retryPurges', { ids: [ids[0], ids[2]] }))
      assert.strictEqual((retried.body.data as { retried: number }).retried, 1)
      assert.include((yield* purgeCalls).flatMap((c) => ('urls' in c ? c.urls : [])), `${ORIGIN}/blog`)
      const cleared = yield* call(post('clearPurges', { ids }))
      assert.strictEqual((cleared.body.data as { cleared: number }).cleared, 1)
      const left = (yield* rows('cachePurges')).map((r) => [r.target, r.attempts])
      // The retried target's late (+60 s) row and the row still retrying stay; the failed /faq row is gone.
      assert.sameDeepMembers(left, [[`${ORIGIN}/blog`, 0], [`${ORIGIN}/pricing`, 2]])
      assert.strictEqual((yield* call(post('retryPurges', { ids: [] }))).status, 400)
    })))
})
