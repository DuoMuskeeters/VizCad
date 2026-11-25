import { assert, describe, it } from '@effect/vitest'
import { contentHeaders, imageContentType, MAX_THUMBNAIL_BYTES, parseRange, rangeNotSatisfiableHeaders, safeHeaders, sniffImage, thumbnailHeaders } from './deliveryHttp'
import { png, webpL, webpLossy, webpX } from './testing/images'
import { crc32, validateThumbnail } from './thumbnail'

describe('parseRange', () => {
  it.each<[string | null, number, unknown]>([
    [null, 100, { kind: 'full' }],
    ['bytes=0-9', 100, { kind: 'partial', start: 0, end: 9 }],
    ['bytes=10-', 100, { kind: 'partial', start: 10, end: 99 }],
    ['bytes=90-500', 100, { kind: 'partial', start: 90, end: 99 }],
    ['bytes=99-99', 100, { kind: 'partial', start: 99, end: 99 }],
    ['bytes=-10', 100, { kind: 'partial', start: 90, end: 99 }],
    ['bytes=-500', 100, { kind: 'partial', start: 0, end: 99 }],
    ['bytes=100-', 100, { kind: 'unsatisfiable' }],
    ['bytes=100-200', 100, { kind: 'unsatisfiable' }],
    ['bytes=-0', 100, { kind: 'unsatisfiable' }],
    // Ignored, the whole object is served: other unit, several ranges, malformed, last before first.
    ['items=0-1', 100, { kind: 'full' }],
    ['bytes=0-1,5-6', 100, { kind: 'full' }],
    ['bytes=5-2', 100, { kind: 'full' }],
    ['bytes=a-b', 100, { kind: 'full' }],
    ['bytes=', 100, { kind: 'full' }],
    ['bytes=1-2-3', 100, { kind: 'full' }],
    ['bytes=-', 100, { kind: 'full' }],
    ['bytes=0-99999999999999999999', 100, { kind: 'full' }],
  ])('%s of %d bytes', (header, size, expected) => {
    assert.deepStrictEqual(parseRange(header, size), expected)
  })
})

describe('response headers', () => {
  const unsafe = ['<script>', 'a"b', 'line\r\nSet-Cookie: x=1', 'ç ğ.step', '\ud800broken.step', '..\\..\\x']

  it('control and bidirectional characters in a legacy name become underscores, in both filename forms', () => {
    const disposition = contentHeaders('a\u0000b\r\nc\u007fd\u0085e\u202Efdp.exe\u200F\u2066x\u2069.step', 1, { kind: 'full' })['content-disposition'] ?? ''
    assert.strictEqual(disposition, `attachment; filename="a_b__c_d_e_fdp.exe__x_.step"; filename*=UTF-8''a_b__c_d_e_fdp.exe__x_.step`)
  })

  it('a 200 download carries the five safe headers and an attachment name', () => {
    const headers = contentHeaders('Bracket v1.step', 5000, { kind: 'full' })
    assert.deepStrictEqual(headers, {
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
      'cache-control': 'private, no-store',
      'cross-origin-resource-policy': 'same-origin',
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="Bracket v1.step"; filename*=UTF-8''Bracket%20v1.step`,
      'accept-ranges': 'bytes',
      'content-length': '5000',
    })
  })

  it('a 206 download adds Content-Range and the slice length', () => {
    const headers = contentHeaders('a.step', 5000, { kind: 'partial', start: 100, end: 199 })
    assert.strictEqual(headers['content-range'], 'bytes 100-199/5000')
    assert.strictEqual(headers['content-length'], '100')
    assert.strictEqual(headers['content-security-policy'], 'sandbox')
    assert.strictEqual(headers['x-content-type-options'], 'nosniff')
  })

  it('416 names the size and still carries the safe headers', () => {
    const headers = rangeNotSatisfiableHeaders(5000)
    assert.strictEqual(headers['content-range'], 'bytes */5000')
    assert.strictEqual(headers['x-content-type-options'], 'nosniff')
  })

  it.each(unsafe)('the file name %j cannot break out of the header', (name) => {
    const headers = new Headers(contentHeaders(name, 1, { kind: 'full' }))
    const disposition = headers.get('content-disposition') ?? ''
    assert.match(disposition, /^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/)
    assert.notInclude(disposition, '\r')
    assert.isNull(headers.get('set-cookie'))
    assert.strictEqual(headers.get('content-type'), 'application/octet-stream')
  })

  it('RFC 5987: the UTF-8 name is percent-encoded', () => {
    assert.include(contentHeaders('çizim ğ.step', 1, { kind: 'full' })['content-disposition'] ?? '', "filename*=UTF-8''%C3%A7izim%20%C4%9F.step")
    assert.include(contentHeaders("it's (1)*.step", 1, { kind: 'full' })['content-disposition'] ?? '', "filename*=UTF-8''it%27s%20%281%29%2A.step")
  })

  it('thumbnails get a fixed image type, never the stored one', () => {
    assert.strictEqual(thumbnailHeaders('png', 10)['content-type'], 'image/png')
    assert.strictEqual(thumbnailHeaders('webp', 10)['content-type'], 'image/webp')
    assert.strictEqual(safeHeaders({ 'x-extra': '1' })['x-extra'], '1')
  })
})

describe('thumbnail validation', () => {
  it('sniffs PNG and WebP by magic only', () => {
    assert.strictEqual(sniffImage(png()), 'png')
    assert.strictEqual(sniffImage(webpX()), 'webp')
    assert.isUndefined(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')))
    assert.isUndefined(sniffImage(new TextEncoder().encode('<html><script>alert(1)</script></html>')))
    assert.isUndefined(sniffImage(new Uint8Array(0)))
    assert.strictEqual(imageContentType('png'), 'image/png')
  })

  it('crc32 matches the standard check value', () => {
    assert.strictEqual(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  })

  it('accepts well-formed PNG and the three WebP kinds', () => {
    assert.strictEqual(validateThumbnail(png(), 'image/png'), 'png')
    assert.strictEqual(validateThumbnail(png(1024, 1024), 'image/png; charset=x'), 'png')
    assert.strictEqual(validateThumbnail(webpX(1024, 7), 'image/webp'), 'webp')
    assert.strictEqual(validateThumbnail(webpL(300, 200), 'IMAGE/WEBP'), 'webp')
    assert.strictEqual(validateThumbnail(webpLossy(64, 64), 'image/webp'), 'webp')
  })

  it('refuses the wrong declared type, other formats, size limits and oversize', () => {
    assert.isUndefined(validateThumbnail(png(), 'image/webp'))
    assert.isUndefined(validateThumbnail(png(), 'image/svg+xml'))
    assert.isUndefined(validateThumbnail(png(), null))
    assert.isUndefined(validateThumbnail(webpX(), 'image/png'))
    assert.isUndefined(validateThumbnail(new TextEncoder().encode('<svg/>'), 'image/png'))
    assert.isUndefined(validateThumbnail(new Uint8Array(0), 'image/png'))
    assert.isUndefined(validateThumbnail(new Uint8Array(MAX_THUMBNAIL_BYTES + 1), 'image/png'))
    assert.isUndefined(validateThumbnail(png(1025, 4), 'image/png'))
    assert.isUndefined(validateThumbnail(png(4, 1025), 'image/png'))
    assert.isUndefined(validateThumbnail(png(0, 4), 'image/png'))
    assert.isUndefined(validateThumbnail(webpX(1025, 4), 'image/webp'))
    assert.isUndefined(validateThumbnail(webpL(4, 1025), 'image/webp'))
    assert.isUndefined(validateThumbnail(webpLossy(2000, 4), 'image/webp'))
  })

  it('refuses a broken PNG: bad CRC, truncated, trailing bytes, missing IEND or IDAT, repeated IHDR', () => {
    const good = png()
    const flipped = Uint8Array.from(good)
    flipped[20] = (flipped[20] ?? 0) ^ 1 // inside IHDR data: the CRC no longer matches
    assert.isUndefined(validateThumbnail(flipped, 'image/png'))
    assert.isUndefined(validateThumbnail(good.subarray(0, good.length - 1), 'image/png'))
    assert.isUndefined(validateThumbnail(good.subarray(0, good.length - 12), 'image/png'), 'no IEND')
    assert.isUndefined(validateThumbnail(Uint8Array.from([...good, 0]), 'image/png'), 'trailing byte')
    assert.isUndefined(validateThumbnail(Uint8Array.from([...good, ...good.subarray(8)]), 'image/png'), 'data after IEND')
    const header = good.subarray(0, 33)
    assert.isUndefined(validateThumbnail(Uint8Array.from([...header, ...good.subarray(good.length - 12)]), 'image/png'), 'no IDAT')
    assert.isUndefined(validateThumbnail(Uint8Array.from([...header, ...header.subarray(8), ...good.subarray(33)]), 'image/png'), 'second IHDR')
  })

  it('refuses a broken WebP: wrong RIFF length, unknown first chunk, truncated header', () => {
    const wrongLength = Uint8Array.from(webpX())
    wrongLength[4] = (wrongLength[4] ?? 0) + 1
    assert.isUndefined(validateThumbnail(wrongLength, 'image/webp'))
    const unknown = Uint8Array.from(webpX())
    unknown[12] = 0x41
    assert.isUndefined(validateThumbnail(unknown, 'image/webp'))
    assert.isUndefined(validateThumbnail(webpX().subarray(0, 20), 'image/webp'))
    const noSignature = Uint8Array.from(webpL())
    noSignature[20] = 0
    assert.isUndefined(validateThumbnail(noSignature, 'image/webp'))
  })
})
