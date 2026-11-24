import { assert, describe, it, layer } from '@effect/vitest'
import { Effect, Layer, Option, Redacted } from 'effect'
import { TestClock } from 'effect/testing'
import * as AppConfig from './AppConfig'
import { attachmentDisposition, presign } from './r2Presign'
import { MemoryStorageControl, normalizeEtag, readBytes, Storage } from './Storage'
import * as StorageLive from './Storage.live'
import * as StorageMemory from './Storage'

const r2 = Option.getOrThrow(AppConfig.testConfig.r2Presign)
const secret = Redacted.value(r2.secretAccessKey)
const NOW = Date.UTC(2026, 10, 23, 10, 0, 0)

// Keys the old app could produce from user file names (`${userId}/${fileId}/${name}`).
const trickyKeys = [
  'user_1/01JD3/bracket.stl',
  'user_1/01JD3/My part #2 (v1)+final?.step',
  'user_1/01JD3/çizim ğüşİ 100%.STL',
  "user_1/01JD3/it's [draft] * & = ; ~.obj",
]

const signed = (expiresInSeconds: number, contentLength = 1000) => ({ expiresInSeconds, contentLength, ifNoneMatch: '*' as const })
const enc = new TextEncoder()
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const hmac = async (key: ArrayBuffer | Uint8Array<ArrayBuffer>, message: string) =>
  crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(message))

/**
 * Recomputes the SigV4 query signature the way R2 does on receipt: from the object key it resolves,
 * not from our URL string. Independent of aws4fetch, so it catches encoding mistakes on our side.
 */
const serverAccepts = async (url: URL, method: string, key: string, headers: Record<string, string> = {}) => {
  const q = url.searchParams
  const date = q.get('X-Amz-Date') ?? ''
  const [, day = '', region = '', service = ''] = (q.get('X-Amz-Credential') ?? '').split('/')
  const signedHeaders = q.get('X-Amz-SignedHeaders') ?? ''
  const canonicalRequest = [
    method,
    `/${[r2.bucketName, ...key.split('/')].map(rfc3986).join('/')}`,
    [...q]
      .filter(([k]) => k !== 'X-Amz-Signature')
      .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
      .sort()
      .join('&'),
    signedHeaders
      .split(';')
      .map((h) => `${h}:${h === 'host' ? url.host : headers[h]}\n`)
      .join(''),
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const scope = `${day}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', date, scope, hex(await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest)))].join('\n')
  let signingKey = await hmac(enc.encode(`AWS4${secret}`), day)
  for (const part of [region, service, 'aws4_request']) signingKey = await hmac(signingKey, part)
  return hex(await hmac(signingKey, stringToSign)) === q.get('X-Amz-Signature')
}

describe('r2Presign', () => {
  it.effect.each(trickyKeys)('upload URL for %s resolves to the same key and verifies', (key) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const url = yield* presign(r2, { method: 'PUT', key, expiresInSeconds: 3600 })
      assert.strictEqual(url.origin, 'https://account.r2.cloudflarestorage.com')
      assert.strictEqual(decodeURIComponent(url.pathname), `/${r2.bucketName}/${key}`)
      assert.strictEqual(url.hash, '')
      assert.strictEqual(url.searchParams.get('X-Amz-Expires'), '3600')
      assert.strictEqual(url.searchParams.get('X-Amz-Date'), '20261123T100000Z')
      assert.strictEqual(url.searchParams.get('X-Amz-Credential'), `${r2.accessKeyId}/20261123/auto/s3/aws4_request`)
      assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'PUT', key)))
      assert.isFalse(yield* Effect.promise(() => serverAccepts(url, 'GET', key)))
    }),
  )

  it('documents the old bug: raw concatenation addresses a different key', () => {
    const key = trickyKeys[1] ?? ''
    const legacy = new URL(`${r2.endpoint.origin}/${r2.bucketName}/${key}`) // legacy/src/routes/api/files/presigned-upload.ts
    assert.notStrictEqual(decodeURIComponent(legacy.pathname), `/${r2.bucketName}/${key}`)
  })

  it.effect('signs Content-Type on upload when given, so the browser must send it unchanged', () =>
    Effect.gen(function* () {
      const key = trickyKeys[1] ?? ''
      const url = yield* presign(r2, { method: 'PUT', key, expiresInSeconds: 60, headers: { 'content-type': 'model/step' } })
      assert.strictEqual(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host')
      assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, { 'content-type': 'model/step' })))
      assert.isFalse(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, { 'content-type': 'text/plain' })))
    }),
  )

  it.effect('signs content-length and if-none-match so one URL writes one object of one size', () =>
    Effect.gen(function* () {
      const key = 'w/ws1/f/f1/o1'
      const headers = { 'content-length': '1000', 'if-none-match': '*', 'content-type': 'application/octet-stream' }
      const url = yield* presign(r2, { method: 'PUT', key, expiresInSeconds: 600, headers })
      assert.strictEqual(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host;if-none-match')
      assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, headers)))
      assert.isFalse(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, { ...headers, 'content-length': '1001' })))
      assert.isFalse(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, { ...headers, 'if-none-match': 'abc' })))
      assert.isFalse(yield* Effect.promise(() => serverAccepts(url, 'PUT', key, { ...headers, 'content-type': 'text/html' })))
    }),
  )

  it.effect('signs the download file name', () =>
    Effect.gen(function* () {
      const key = trickyKeys[2] ?? ''
      const disposition = attachmentDisposition('çizim "son".stl')
      const url = yield* presign(r2, { method: 'GET', key, expiresInSeconds: 60, query: { 'response-content-disposition': disposition } })
      assert.strictEqual(url.searchParams.get('response-content-disposition'), disposition)
      assert.strictEqual(disposition, `attachment; filename="_izim _son_.stl"; filename*=UTF-8''%C3%A7izim%20%22son%22.stl`)
      assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'GET', key)))
    }),
  )

  it.effect.each([
    { name: 'empty', key: '' },
    { name: 'a lone "." segment', key: 'u/f/./a.stl' },
    { name: 'a ".." segment', key: 'u/f/../other/a.stl' },
    { name: 'a key that is ".."', key: '..' },
    { name: 'a trailing ".." segment', key: 'u/..' },
    { name: 'a lone surrogate', key: 'u/f/\uD83D.stl' },
    { name: 'a key over 1024 bytes', key: `u/${'ç'.repeat(512)}` },
  ])('rejects a key with $name before signing', ({ key }) =>
    Effect.gen(function* () {
      const error = yield* presign(r2, { method: 'PUT', key, expiresInSeconds: 60 }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'StorageError')
      assert.strictEqual(error.operation, 'presign')
    }),
  )

  it.effect('still signs keys that only look odd: dots inside names, empty segments, emoji', () =>
    Effect.gen(function* () {
      for (const key of ['u/f/.hidden', 'u/f/a..b.stl', 'u/f/...', 'u//f/a.stl', 'u/f/🚀 rocket.stl']) {
        const url = yield* presign(r2, { method: 'PUT', key, expiresInSeconds: 60 })
        assert.strictEqual(decodeURIComponent(url.pathname), `/${r2.bucketName}/${key}`)
        assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'PUT', key)))
      }
    }),
  )

  it.effect.each([0, -1, 1.5, 7 * 24 * 3600 + 1])('rejects expiry %s', (expiresInSeconds) =>
    Effect.gen(function* () {
      const error = yield* presign(r2, { method: 'GET', key: 'k', expiresInSeconds }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'StorageError')
    }),
  )
})

describe('Storage.live', () => {
  // Presigning never touches the binding, so an empty bucket stub is enough here.
  const bucket = {} as R2Bucket

  it.effect('presigns through AppConfig credentials', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const url = yield* storage.presignDownload('u/f/a b.stl', { expiresInSeconds: 60, downloadFilename: 'a b.stl' })
      assert.strictEqual(url.pathname, '/vizcad-files-test/u/f/a%20b.stl')
      assert.isTrue(url.searchParams.has('response-content-disposition'))
    }).pipe(Effect.provide(StorageLive.layer(bucket).pipe(Layer.provide(AppConfig.test())))),
  )

  it.effect('presigned uploads carry the signed size, if-none-match and content type', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const url = yield* storage.presignUpload('w/ws1/f/f1/o1', { ...signed(600, 52_428_800), contentType: 'application/octet-stream' })
      assert.strictEqual(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host;if-none-match')
      assert.isTrue(yield* Effect.promise(() => serverAccepts(url, 'PUT', 'w/ws1/f/f1/o1', {
        'content-length': '52428800', 'if-none-match': '*', 'content-type': 'application/octet-stream',
      })))
    }).pipe(Effect.provide(StorageLive.layer(bucket).pipe(Layer.provide(AppConfig.test())))),
  )

  it.effect('reads ranges through the binding and returns the whole-object size', () => {
    const calls: Array<unknown> = []
    const object = { key: 'k', size: 1000, etag: 'abc', httpMetadata: {}, uploaded: new Date(0), body: new Blob(['hi']).stream() }
    const fake = { get: async (_key: string, options?: unknown) => { calls.push(options); return object } } as unknown as R2Bucket
    return Effect.gen(function* () {
      const storage = yield* Storage
      const head = Option.getOrThrow(yield* storage.getRange('k', { offset: 0, length: 64 }))
      const tail = Option.getOrThrow(yield* storage.getRange('k', { suffix: 64 }))
      const viaGet = Option.getOrThrow(yield* storage.get('k', { range: { offset: 10, length: 5 } }))
      assert.strictEqual(head.size, 1000)
      assert.strictEqual(tail.size, 1000)
      assert.strictEqual(viaGet.etag, 'abc')
      assert.deepStrictEqual(calls, [{ range: { offset: 0, length: 64 } }, { range: { suffix: 64 } }, { range: { offset: 10, length: 5 } }])
    }).pipe(Effect.provide(StorageLive.layer(fake).pipe(Layer.provide(AppConfig.test()))))
  })

  it.effect('fails with ConfigError when R2 credentials are missing', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const error = yield* storage.presignUpload('k', signed(60)).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'ConfigError')
    }).pipe(Effect.provide(StorageLive.layer(bucket).pipe(Layer.provide(AppConfig.test({ r2Presign: Option.none() }))))),
  )
})

layer(StorageMemory.memory)('Storage (in-memory)', (it) => {
  it.effect('put, head, get and delete', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const key = trickyKeys[1] ?? ''
      assert.isTrue(Option.isNone(yield* storage.head(key)))

      const put = yield* storage.put(key, 'solid part', { contentType: 'model/step' })
      assert.strictEqual(put.size, 10)

      const head = Option.getOrThrow(yield* storage.head(key))
      assert.deepStrictEqual(head, put)

      const got = Option.getOrThrow(yield* storage.get(key))
      assert.strictEqual(yield* Effect.promise(() => new Response(got.body).text()), 'solid part')

      yield* storage.delete([key])
      assert.isTrue(Option.isNone(yield* storage.get(key)))
    }),
  )

  it.effect('presigned URLs expose method and options; expiry is validated', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const up = yield* storage.presignUpload('u/f/a.stl', { ...signed(600), contentType: 'model/stl' })
      assert.strictEqual(up.searchParams.get('method'), 'PUT')
      assert.strictEqual(up.searchParams.get('contentType'), 'model/stl')
      const error = yield* storage.presignDownload('u/f/a.stl', { expiresInSeconds: 0 }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'StorageError')
      const badKey = yield* storage.presignUpload('u/../a.stl', signed(60)).pipe(Effect.flip)
      assert.strictEqual(badKey._tag, 'StorageError')
    }),
  )

  it.effect('range reads return slices; the size stays the full object size', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      yield* storage.put('r/obj', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
      const text = (o: Option.Option<{ readonly key: string; readonly size: number; readonly etag: string; readonly contentType: string | null; readonly uploadedAt: Date; readonly body: ReadableStream<Uint8Array> }>) =>
        Effect.gen(function* () {
          const object = Option.getOrThrow(o)
          return { size: object.size, bytes: [...(yield* readBytes('r/obj', object))] }
        })
      assert.deepStrictEqual(yield* text(yield* storage.getRange('r/obj', { offset: 2, length: 3 })), { size: 10, bytes: [2, 3, 4] })
      assert.deepStrictEqual(yield* text(yield* storage.getRange('r/obj', { suffix: 4 })), { size: 10, bytes: [6, 7, 8, 9] })
      assert.deepStrictEqual(yield* text(yield* storage.getRange('r/obj', { suffix: 99 })), { size: 10, bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })
      assert.deepStrictEqual(yield* text(yield* storage.get('r/obj', { range: { offset: 8, length: 99 } })), { size: 10, bytes: [8, 9] })
      assert.isTrue(Option.isNone(yield* storage.getRange('r/missing', { suffix: 1 })))
    }),
  )

  it.effect('the same bytes always get the same ETag', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const a = yield* storage.put('e/a', 'same')
      const b = yield* storage.put('e/b', 'same')
      const c = yield* storage.put('e/c', 'other')
      assert.strictEqual(a.etag, b.etag)
      assert.notStrictEqual(a.etag, c.etag)
      assert.match(a.etag, /^[0-9a-f]{32}$/)
    }),
  )

  it('normalizes quoted and weak ETags', () => {
    assert.strictEqual(normalizeEtag('"abc"'), 'abc')
    assert.strictEqual(normalizeEtag('W/"abc"'), 'abc')
    assert.strictEqual(normalizeEtag(' abc '), 'abc')
  })
})

layer(StorageMemory.memory)('Storage (in-memory) browser PUT simulation', (it) => {
  const bytes = new Uint8Array(1000).fill(7)
  const headers = { 'content-type': 'application/octet-stream', 'if-none-match': '*' }

  it.effect('enforces the signed rules like R2: size, headers, existing key, expiry', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const storage = yield* Storage
      const control = yield* MemoryStorageControl
      const options = { ...signed(600, 1000), contentType: 'application/octet-stream' }
      const url = yield* storage.presignUpload('w/ws1/f/f1/o1', options)

      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, new Uint8Array(999), headers), { status: 403 })
      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, new Uint8Array(1001), headers), { status: 403 })
      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, bytes, { ...headers, 'if-none-match': 'x' }), { status: 403 })
      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, bytes, { 'content-type': 'application/octet-stream' }), { status: 403 })
      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, bytes, { ...headers, 'content-type': 'text/html' }), { status: 403 })
      assert.deepStrictEqual(yield* control.keys, [])

      const stored = yield* control.simulateBrowserPut(url, bytes, headers)
      assert.strictEqual(stored.status, 200)
      const head = Option.getOrThrow(yield* storage.head('w/ws1/f/f1/o1'))
      assert.strictEqual(stored.etag, `"${head.etag}"`)
      assert.strictEqual(head.size, 1000)

      // A second PUT to the same key is refused, even with identical bytes.
      assert.deepStrictEqual(yield* control.simulateBrowserPut(url, bytes, headers), { status: 412 })

      // An expired URL is refused.
      const later = yield* storage.presignUpload('w/ws1/f/f1/o2', options)
      yield* TestClock.adjust('601 seconds')
      assert.deepStrictEqual(yield* control.simulateBrowserPut(later, bytes, headers), { status: 403 })
    }),
  )

  it.effect('records operation names and can simulate a failing delete', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const control = yield* MemoryStorageControl
      yield* storage.put('d/k', 'x')
      yield* control.failDeletes(true)
      assert.strictEqual((yield* Effect.flip(storage.delete(['d/k'])))._tag, 'StorageError')
      assert.isTrue(Option.isSome(yield* storage.head('d/k')))
      yield* control.failDeletes(false)
      yield* storage.delete(['d/k'])
      assert.isTrue(Option.isNone(yield* storage.head('d/k')))
      const calls = yield* control.calls
      assert.isTrue(calls.includes('put') && calls.includes('delete') && !calls.includes('presignDownload'))
    }),
  )
})
