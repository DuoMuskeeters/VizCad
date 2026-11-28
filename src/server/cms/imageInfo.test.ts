import { describe, expect, it } from 'vitest'
import { jpegBytes, pngBytes, svgBytes, webpBytes, webpLosslessBytes, webpLossyBytes } from '../testing/cmsImages'
import { ASSET_LIMITS, readImageInfo } from './imageInfo'

describe('readImageInfo', () => {
  it('reads the type and size of PNG, JPEG and the three WebP kinds from the bytes', () => {
    expect(readImageInfo(pngBytes(1600, 900))).toEqual({ ok: true, mime: 'image/png', width: 1600, height: 900 })
    expect(readImageInfo(jpegBytes(1200, 800))).toEqual({ ok: true, mime: 'image/jpeg', width: 1200, height: 800 })
    expect(readImageInfo(webpBytes(1600, 1067))).toEqual({ ok: true, mime: 'image/webp', width: 1600, height: 1067 })
    expect(readImageInfo(webpLossyBytes(800, 600))).toEqual({ ok: true, mime: 'image/webp', width: 800, height: 600 })
    expect(readImageInfo(webpLosslessBytes(640, 480))).toEqual({ ok: true, mime: 'image/webp', width: 640, height: 480 })
  })

  it('refuses SVG, HTML, GIF and text by type, whatever the name or declared type would say', () => {
    expect(readImageInfo(svgBytes)).toEqual({ ok: false, reason: 'type' })
    expect(readImageInfo(new TextEncoder().encode('<!doctype html><script>alert(1)</script>'))).toEqual({ ok: false, reason: 'type' })
    expect(readImageInfo(new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000'))).toEqual({ ok: false, reason: 'type' })
    expect(readImageInfo(new Uint8Array(0))).toEqual({ ok: false, reason: 'type' })
  })

  it('refuses a side over the cap, a pixel count over the cap, a zero size and a truncated header', () => {
    expect(readImageInfo(pngBytes(ASSET_LIMITS.side + 1, 10))).toEqual({ ok: false, reason: 'dimensions' })
    expect(readImageInfo(pngBytes(4096, 4096))).toEqual({ ok: false, reason: 'dimensions' })
    expect(readImageInfo(pngBytes(4096, 3072)).ok).toBe(true)
    expect(readImageInfo(pngBytes(0, 10))).toEqual({ ok: false, reason: 'dimensions' })
    expect(readImageInfo(pngBytes(100, 100).slice(0, 20))).toEqual({ ok: false, reason: 'dimensions' })
    expect(readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0, 0, 0, 0, 0]))).toEqual({ ok: false, reason: 'dimensions' })
    // A PNG whose first chunk is not IHDR.
    const bad = pngBytes(10, 10)
    bad[12] = 0x58
    expect(readImageInfo(bad)).toEqual({ ok: false, reason: 'dimensions' })
  })

  it('stops on a JPEG whose segment length is broken instead of looping', () => {
    expect(readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual({ ok: false, reason: 'dimensions' })
  })
})
