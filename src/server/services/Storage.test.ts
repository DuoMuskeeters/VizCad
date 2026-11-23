import { assert, describe, it, layer } from '@effect/vitest'
import { Effect, Layer, Option, Redacted } from 'effect'
import { TestClock } from 'effect/testing'
import * as AppConfig from './AppConfig'
import { attachmentDisposition, presign } from './r2Presign'
import { Storage } from './Storage'
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
      assert.strictEqual(url.pathname, '/vizcad-files-bucket/u/f/a%20b.stl')
      assert.isTrue(url.searchParams.has('response-content-disposition'))
    }).pipe(Effect.provide(StorageLive.layer(bucket).pipe(Layer.provide(AppConfig.test())))),
  )

  it.effect('fails with ConfigError when R2 credentials are missing', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const error = yield* storage.presignUpload('k', { expiresInSeconds: 60 }).pipe(Effect.flip)
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
      const up = yield* storage.presignUpload('u/f/a.stl', { expiresInSeconds: 600, contentType: 'model/stl' })
      assert.strictEqual(up.searchParams.get('method'), 'PUT')
      assert.strictEqual(up.searchParams.get('contentType'), 'model/stl')
      const error = yield* storage.presignDownload('u/f/a.stl', { expiresInSeconds: 0 }).pipe(Effect.flip)
      assert.strictEqual(error._tag, 'StorageError')
    }),
  )
})
