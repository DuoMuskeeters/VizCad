import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  auditId, cookieValue, decryptToken, encryptToken, fromBase64Url, hashPassword, isTokenFormat, newToken, PASSWORD_ITERATIONS,
  proofCookieName, proofSetCookie, readProof, signProof, timingSafeEqual, toBase64Url, tokenDigest, verifyPassword,
} from './shareCrypto'

const key1 = new Uint8Array(32).fill(1)
const key2 = new Uint8Array(32).fill(2)
const proofKey = new Uint8Array(32).fill(9)

describe('base64url and tokens', () => {
  it('round-trips bytes and rejects other text', () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255])
    assert.strictEqual(toBase64Url(bytes), 'APr7_P3-_w')
    assert.deepStrictEqual([...(fromBase64Url('APr7_P3-_w') ?? [])], [...bytes])
    assert.deepStrictEqual([...(fromBase64Url('APr7/P3+/w==') ?? [])], [...bytes])
    assert.isUndefined(fromBase64Url('not base64!'))
    assert.isUndefined(fromBase64Url('A'))
  })

  it('new tokens are 43 base64url characters and unique; legacy tokens are 32 alphanumerics', () => {
    const token = newToken()
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    assert.notStrictEqual(token, newToken())
    assert.isTrue(isTokenFormat(token))
    assert.isTrue(isTokenFormat('abcdefghijklmnopqrstuvwxyz012345'))
    for (const bad of ['', 'short', 'x'.repeat(31), 'x'.repeat(33), 'x'.repeat(44), `${'x'.repeat(42)}!`, `${'x'.repeat(31)}-`, `${'x'.repeat(41)} /`]) {
      assert.isFalse(isTokenFormat(bad), bad)
    }
  })

  it.effect('the digest is the fixed SHA-256 hex of the token', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* tokenDigest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    }),
  )

  it('compares in constant time over equal lengths only', () => {
    assert.isTrue(timingSafeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2])))
    assert.isFalse(timingSafeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3])))
    assert.isFalse(timingSafeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1])))
  })
})

describe('token encryption', () => {
  it.effect('decrypts with the same key, link and workspace, and with nothing else', () =>
    Effect.gen(function* () {
      const token = newToken()
      const sealed = yield* encryptToken(key1, token, 'link-1', 'ws-1')
      assert.notInclude(sealed, token)
      assert.strictEqual(yield* decryptToken(key1, sealed, 'link-1', 'ws-1'), token)
      assert.notStrictEqual(sealed, yield* encryptToken(key1, token, 'link-1', 'ws-1'), 'a fresh nonce every time')
      assert.strictEqual((yield* Effect.flip(decryptToken(key2, sealed, 'link-1', 'ws-1')))._tag, 'ConfigError')
      assert.strictEqual((yield* Effect.flip(decryptToken(key1, sealed, 'link-2', 'ws-1')))._tag, 'ConfigError')
      assert.strictEqual((yield* Effect.flip(decryptToken(key1, sealed, 'link-1', 'ws-2')))._tag, 'ConfigError')
      assert.strictEqual((yield* Effect.flip(decryptToken(key1, 'AAAA', 'link-1', 'ws-1')))._tag, 'ConfigError')
      assert.strictEqual((yield* Effect.flip(decryptToken(key1, `${sealed.slice(0, -2)}AA`, 'link-1', 'ws-1')))._tag, 'ConfigError')
    }),
  )
})

describe('passwords', () => {
  it.effect('hashes with PBKDF2 and verifies in constant time', () =>
    Effect.gen(function* () {
      const stored = yield* hashPassword('correct horse')
      const [version, iterations, salt, hash] = stored.split('$')
      assert.deepStrictEqual([version, iterations], ['p1', String(PASSWORD_ITERATIONS)])
      assert.strictEqual(fromBase64Url(salt ?? '')?.byteLength, 16)
      assert.strictEqual(fromBase64Url(hash ?? '')?.byteLength, 32)
      assert.isTrue(yield* verifyPassword(stored, 'correct horse'))
      assert.isFalse(yield* verifyPassword(stored, 'correct horse '))
      assert.isFalse(yield* verifyPassword(stored, ''))
      assert.notStrictEqual(stored, yield* hashPassword('correct horse'), 'a fresh salt every time')
    }),
  )

  it.effect('a malformed or unsupported stored hash never verifies', () =>
    Effect.gen(function* () {
      for (const stored of ['', 'plain', 'p1$100000$AAAA', 'p2$100000$AAAA$AAAA', 'p1$100001$AAAAAAAAAAAAAAAAAAAAAA$AAAA', 'p1$0$AAAA$AAAA', 'p1$x$AAAA$AAAA', 'p1$1$AAAA$AAAA$extra']) {
        assert.isFalse(yield* verifyPassword(stored, 'plain'), stored)
      }
    }),
  )
})

describe('audit ids', () => {
  it.effect('one id per actor, object and purpose in a ten minute window', () =>
    Effect.gen(function* () {
      const base = yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', 1_795_514_400)
      assert.match(base, /^[0-9a-f]{64}$/)
      assert.strictEqual(base, yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', 1_795_514_400 + 100))
      const windowStart = Math.floor(1_795_514_400 / 600) * 600
      assert.strictEqual(yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', windowStart), yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', windowStart + 599))
      const others = [
        yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', windowStart + 600),
        yield* auditId(proofKey, 'preview', 'user-1', 'file-1', 'k/1', 1_795_514_400),
        yield* auditId(proofKey, 'download', 'user-2', 'file-1', 'k/1', 1_795_514_400),
        yield* auditId(proofKey, 'download', 'user-1', 'file-2', 'k/1', 1_795_514_400),
        yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/2', 1_795_514_400),
        yield* auditId(new Uint8Array(32).fill(8), 'download', 'user-1', 'file-1', 'k/1', 1_795_514_400),
      ]
      assert.strictEqual(new Set([base, ...others]).size, 7)
    }),
  )
})

describe('HMAC domains', () => {
  const mac = (message: string) =>
    Effect.promise(async () => {
      const k = await crypto.subtle.importKey('raw', proofKey.slice(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))))
    })

  it.effect('proofs are signed over a `proof` prefix and audit ids over an `audit` prefix', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* signProof(proofKey, 'link-1', 3, 700), `v1.700.${yield* mac('proof\nlink-1\n3\n700')}`)
      const id = yield* auditId(proofKey, 'download', 'user-1', 'file-1', 'k/1', 1_795_514_400)
      const expected = Array.from(fromBase64Url(yield* mac(['audit', 'download', 'user-1', 'file-1', 'k/1', Math.floor(1_795_514_400 / 600)].join('\n'))) ?? [], (b) => b.toString(16).padStart(2, '0')).join('')
      assert.strictEqual(id, expected)
    }),
  )
})

describe('password proof cookie', () => {
  const NOW = 1_795_514_400
  const cookieFor = (linkId: string, value: string) => `theme=dark; ${proofCookieName(linkId)}=${value}; other=1`

  it.effect('a signed proof reads back for the same link and revision until it expires', () =>
    Effect.gen(function* () {
      const value = yield* signProof(proofKey, 'link-1', 3, NOW + 600)
      assert.match(value, /^v1\.1795515000\.[A-Za-z0-9_-]{43}$/)
      assert.deepStrictEqual(yield* readProof(proofKey, cookieFor('link-1', value), 'link-1', 3, NOW), { linkId: 'link-1', revision: 3, expiresAt: NOW + 600 })
      assert.isUndefined(yield* readProof(proofKey, cookieFor('link-1', value), 'link-1', 3, NOW + 600), 'expired exactly at its time')
    }),
  )

  it.effect('a new revision, another link, another key or a tampered value is no proof', () =>
    Effect.gen(function* () {
      const value = yield* signProof(proofKey, 'link-1', 3, NOW + 600)
      assert.isUndefined(yield* readProof(proofKey, cookieFor('link-1', value), 'link-1', 4, NOW), 'revision moved on')
      assert.isUndefined(yield* readProof(proofKey, cookieFor('link-2', value), 'link-2', 3, NOW), 'proof of another link')
      assert.isUndefined(yield* readProof(new Uint8Array(32).fill(1), cookieFor('link-1', value), 'link-1', 3, NOW), 'other key')
      const [v, , mac] = value.split('.')
      assert.isUndefined(yield* readProof(proofKey, cookieFor('link-1', `${v}.${NOW + 99999}.${mac}`), 'link-1', 3, NOW), 'later expiry')
      assert.isUndefined(yield* readProof(proofKey, cookieFor('link-1', `${v}.${NOW + 600}.${mac?.slice(0, -2)}AA`), 'link-1', 3, NOW), 'flipped MAC')
      for (const junk of ['', 'v1', 'v1.x.y', 'v2.1795515000.abc', 'v1.1795515000', `${value}.extra`]) {
        assert.isUndefined(yield* readProof(proofKey, cookieFor('link-1', junk), 'link-1', 3, NOW), junk)
      }
      assert.isUndefined(yield* readProof(proofKey, null, 'link-1', 3, NOW))
    }),
  )

  it('the cookie is __Host- prefixed, HttpOnly, Secure, Lax, Path=/ and without Domain', () => {
    assert.strictEqual(proofCookieName('abc-123'), '__Host-vizcad-share-abc-123')
    assert.isUndefined(proofCookieName('a b'))
    assert.isUndefined(proofCookieName('a;b'))
    const header = proofSetCookie('abc-123', 'v1.1.x', 600)
    assert.strictEqual(header, '__Host-vizcad-share-abc-123=v1.1.x; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax')
    assert.notInclude(header ?? '', 'Domain')
    assert.isUndefined(proofSetCookie('a b', 'x', 1))
  })

  it('finds a cookie by exact name', () => {
    assert.strictEqual(cookieValue('a=1; b=2; c=3', 'b'), '2')
    assert.strictEqual(cookieValue('xb=1; b=2', 'b'), '2')
    assert.isUndefined(cookieValue('a=1', 'b'))
    assert.isUndefined(cookieValue(null, 'b'))
  })
})
