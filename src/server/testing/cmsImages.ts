/** Minimal image headers for tests: enough bytes for `readImageInfo` (server/cms/imageInfo.ts) to read the size. */

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16be = (n: number) => [(n >>> 8) & 255, n & 255]
const u24le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]

/** PNG signature + IHDR. `salt` changes the bytes (and so the SHA) without changing the size. */
export const pngBytes = (width: number, height: number, salt = 0) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, salt & 255, 0, 0, 0])

/** SOI, an APP0 segment, then SOF0 with the size. */
export const jpegBytes = (width: number, height: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])

const riff = (chunk: string, payload: ReadonlyArray<number>) => {
  const body = [...'WEBP'].map((c) => c.charCodeAt(0)).concat([...chunk].map((c) => c.charCodeAt(0)), u32le(payload.length), payload)
  return new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat(u32le(body.length), body))
}
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]

/** Extended WebP (`VP8X`): canvas size minus one, 24-bit little endian. */
export const webpBytes = (width: number, height: number) => riff('VP8X', [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)])

/** Lossy WebP (`VP8 `): frame tag, start code, 14-bit sizes. */
export const webpLossyBytes = (width: number, height: number) => riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, width & 255, (width >>> 8) & 0x3f, height & 255, (height >>> 8) & 0x3f, 0, 0])

/** Lossless WebP (`VP8L`): signature 0x2f, then 14-bit (size - 1) fields. */
export const webpLosslessBytes = (width: number, height: number) => {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
  return riff('VP8L', [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255, 0, 0, 0])
}

export const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>')
