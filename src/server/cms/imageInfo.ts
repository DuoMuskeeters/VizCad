/**
 * Reads an uploaded CMS image's type and size from its bytes (docs/12 §3.2 `POST /api/cms/assets`). Pure: the magic
 * bytes decide the type (never the file name or the declared Content-Type), and the pixel size comes from the header,
 * so nothing is decoded. Only PNG, JPEG and WebP are taken; SVG (script on our origin) and every other type are not.
 */

export const ASSET_LIMITS = {
  /** Upload body cap (the CPU gate measured 1.7 ms for magic bytes + size + SHA-256 at 5 MB, docs/12 6c-1 notes). */
  bytes: 5 * 1024 * 1024,
  /** Longest side in pixels. The editor scales to 1600 px before upload; this stops a crafted header. */
  side: 4096,
  /** Width × height. */
  pixels: 4096 * 3072,
} as const

export type AssetMime = 'image/png' | 'image/jpeg' | 'image/webp'

export const ASSET_EXTENSION: Readonly<Record<AssetMime, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export type ImageInfo =
  | { readonly ok: true; readonly mime: AssetMime; readonly width: number; readonly height: number }
  /** `type`: not one of the three formats. `dimensions`: the header is unreadable, or the size is over the caps. */
  | { readonly ok: false; readonly reason: 'type' | 'dimensions' }

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b)

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const u32be = (b: Uint8Array, i: number) => (((b[i] ?? 0) << 24) >>> 0) + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0)
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16)

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = [0x49, 0x48, 0x44, 0x52]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/** PNG: the first chunk must be IHDR (width, height as big-endian u32). */
const png = (b: Uint8Array) => (b.length >= 24 && startsWith(b, IHDR, 12) ? { width: u32be(b, 16), height: u32be(b, 20) } : null)

/** JPEG: walks the marker segments to the first start-of-frame (SOF0–SOF15 without DHT, JPG and DAC). */
const jpeg = (b: Uint8Array) => {
  let i = 2
  // Bounded: every step moves forward by at least 2 bytes.
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const length = u16be(b, i + 2)
    if (length < 2) return null
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16be(b, i + 7), height: u16be(b, i + 5) }
    // Start of scan before any frame header: not a valid baseline/progressive JPEG.
    if (marker === 0xda) return null
    i += 2 + length
  }
  return null
}

/** WebP: lossy (`VP8 `), lossless (`VP8L`) or extended (`VP8X`, canvas size). */
const webp = (b: Uint8Array) => {
  if (b.length < 25) return null
  const chunk = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0)
  if (chunk === 'VP8 ') {
    if (b.length < 30) return null
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    if (!startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return b.length < 30 ? null : { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

/** The image's type and pixel size, or why it is refused. */
export const readImageInfo = (bytes: Uint8Array): ImageInfo => {
  const found: { mime: AssetMime; size: { width: number; height: number } | null } | null = startsWith(bytes, PNG)
    ? { mime: 'image/png', size: png(bytes) }
    : startsWith(bytes, [0xff, 0xd8, 0xff])
      ? { mime: 'image/jpeg', size: jpeg(bytes) }
      : startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)
        ? { mime: 'image/webp', size: webp(bytes) }
        : null
  if (found === null) return { ok: false, reason: 'type' }
  const size = found.size
  if (size === null || size.width < 1 || size.height < 1) return { ok: false, reason: 'dimensions' }
  if (size.width > ASSET_LIMITS.side || size.height > ASSET_LIMITS.side || size.width * size.height > ASSET_LIMITS.pixels) return { ok: false, reason: 'dimensions' }
  return { ok: true, mime: found.mime, width: size.width, height: size.height }
}
