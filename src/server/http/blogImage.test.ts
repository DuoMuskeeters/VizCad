import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as AppConfig from '../services/AppConfig'
import * as StorageMemory from '../services/Storage'
import { Storage } from '../services/Storage'
import { blogImageKeyOf, blogImageResponse } from './blogImage'

const layer = StorageMemory.memory.pipe(Layer.provideMerge(AppConfig.test()))
const meta = { requestId: null }
const get = (path: string, method = 'GET') =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Storage>()
    return yield* blogImageResponse(new Request(`https://viz-cad.com${path}`, { method }), Layer.succeedContext(context), meta)
  })

describe('blogImageKeyOf', () => {
  it('decodes one segment once and keeps only blog/ keys', () => {
    assert.strictEqual(blogImageKeyOf('/api/blog/image/blog%2Fpost%2Fa.png'), 'blog/post/a.png')
    assert.strictEqual(blogImageKeyOf('/api/blog/image/blog%2Fa%2F01J.webp'), 'blog/a/01J.webp')
    assert.isNull(blogImageKeyOf('/api/blog/image/users%2Fu1%2Ffile.step'))
    assert.isNull(blogImageKeyOf('/api/blog/image/blog%2F..%2Fusers%2Fx'))
    assert.isNull(blogImageKeyOf('/api/blog/image/blog%2F%2Fx'))
    assert.isNull(blogImageKeyOf('/api/blog/image/blog/x.png'))
    assert.isNull(blogImageKeyOf('/api/blog/image/%E0%A4%A'))
    // Well-formed escapes that are not UTF-8: null (404), not a URIError (500).
    assert.isNull(blogImageKeyOf('/api/blog/image/blog%2F%FF.png'))
    assert.isNull(blogImageKeyOf('/api/blog/image/blog%2F%E2%82.png'))
    assert.isNull(blogImageKeyOf('/api/blog/image/'))
  })
})

describe('GET /api/blog/image/*', () => {
  it.effect('serves the R2 object with its MIME type, a year of immutable caching, the ETag and nosniff', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const put = yield* storage.put('blog/hello/a.png', new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' })
      const response = yield* get('/api/blog/image/blog%2Fhello%2Fa.png')
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get('content-type'), 'image/png')
      assert.strictEqual(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
      assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff')
      assert.strictEqual(response.headers.get('etag'), `"${put.etag}"`)
      assert.isNull(response.headers.get('content-security-policy'))
      assert.deepStrictEqual([...new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))], [137, 80, 78, 71])
      const head = yield* get('/api/blog/image/blog%2Fhello%2Fa.png', 'HEAD')
      assert.strictEqual(head.status, 200)
      assert.isNull(head.body)
    }).pipe(Effect.provide(layer)),
  )

  it.effect('SVG and non-image types are sandboxed; a missing type is served as JPEG (legacy)', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      yield* storage.put('blog/x/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', { contentType: 'image/svg+xml' })
      yield* storage.put('blog/x/page.html', '<script>alert(1)</script>', { contentType: 'text/html' })
      yield* storage.put('blog/x/old', new Uint8Array([255, 216]))
      const svg = yield* get('/api/blog/image/blog%2Fx%2Flogo.svg')
      assert.strictEqual(svg.headers.get('content-security-policy'), 'sandbox')
      assert.strictEqual(svg.headers.get('x-content-type-options'), 'nosniff')
      assert.strictEqual((yield* get('/api/blog/image/blog%2Fx%2Fpage.html')).headers.get('content-security-policy'), 'sandbox')
      const old = yield* get('/api/blog/image/blog%2Fx%2Fold')
      assert.strictEqual(old.headers.get('content-type'), 'image/jpeg')
      assert.isNull(old.headers.get('content-security-policy'))
    }).pipe(Effect.provide(layer)),
  )

  it.effect('a key outside blog/, a traversal or a missing object is 404 and never cached', () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      yield* storage.put('users/u1/secret.step', 'x')
      for (const path of ['/api/blog/image/users%2Fu1%2Fsecret.step', '/api/blog/image/blog%2F..%2Fusers%2Fu1%2Fsecret.step', '/api/blog/image/blog%2Fnope.png']) {
        const response = yield* get(path)
        assert.strictEqual(response.status, 404, path)
        assert.strictEqual(response.headers.get('cache-control'), 'no-store')
      }
    }).pipe(Effect.provide(layer)),
  )
})
