import { crc32 } from '../thumbnail'

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const text = (s: string) => [...s].map((c) => c.charCodeAt(0))

const chunk = (type: string, data: ReadonlyArray<number>) => {
  const body = Uint8Array.from([...text(type), ...data])
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

/** A structurally valid PNG (the pixel data is not a real image; only the container is checked). */
export const png = (width = 4, height = 4) =>
  Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]),
    ...chunk('IEND', []),
  ])

const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]

/** A WebP container with a VP8X header (canvas width and height as given). */
export const webpX = (width = 4, height = 4) => {
  const payload = [...text('WEBP'), ...text('VP8X'), ...le32(10), 0, 0, 0, 0, (width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255,
    (height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255]
  return Uint8Array.from([...text('RIFF'), ...le32(payload.length), ...payload])
}

/** A WebP container with a lossless VP8L header. */
export const webpL = (width = 4, height = 4) => {
  const bits = (width - 1) | ((height - 1) << 14)
  const payload = [...text('WEBP'), ...text('VP8L'), ...le32(5), 0x2f, ...le32(bits)]
  return Uint8Array.from([...text('RIFF'), ...le32(payload.length), ...payload])
}

/** A WebP container with a lossy VP8 frame header. */
export const webpLossy = (width = 4, height = 4) => {
  const payload = [...text('WEBP'), ...text('VP8 '), ...le32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, width & 255, width >> 8, height & 255, height >> 8]
  return Uint8Array.from([...text('RIFF'), ...le32(payload.length), ...payload])
}
