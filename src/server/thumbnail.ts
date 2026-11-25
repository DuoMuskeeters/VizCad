import { imageContentType, type ImageKind, MAX_THUMBNAIL_BYTES, sniffImage } from './deliveryHttp'

/**
 * Validation of an uploaded thumbnail (docs/09 §3.1). The browser or the Faz 5 pipeline sends the image; the Worker only
 * stores bytes it has parsed to the end: PNG (every chunk CRC, one IHDR first, IDAT, IEND last, nothing after) or WebP
 * (RIFF length, a VP8, VP8L or VP8X chunk first), at most 1024×1024 and 1 MiB. Pure functions; tested without storage.
 */

export const MAX_THUMBNAIL_SIDE = 1024

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const fourcc = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))

const validSide = (n: number) => n >= 1 && n <= MAX_THUMBNAIL_SIDE

const validPng = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let sawIdat = false
  for (let index = 0; offset + 12 <= bytes.byteLength; index++) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > bytes.byteLength) return false
    const type = fourcc(bytes, offset + 4)
    if (view.getUint32(offset + 8 + length) !== crc32(bytes.subarray(offset + 4, offset + 8 + length))) return false
    if (index === 0) {
      if (type !== 'IHDR' || length !== 13 || !validSide(view.getUint32(offset + 8)) || !validSide(view.getUint32(offset + 12))) return false
    } else if (type === 'IHDR') {
      return false
    }
    if (type === 'IDAT') sawIdat = true
    if (type === 'IEND') return length === 0 && sawIdat && end === bytes.byteLength
    offset = end
  }
  return false
}

const validWebp = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) !== bytes.byteLength - 8) return false
  const chunk = fourcc(bytes, 12)
  if (chunk === 'VP8X') {
    if (bytes.byteLength < 30) return false
    const width = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16))
    const height = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16))
    return validSide(width) && validSide(height)
  }
  if (chunk === 'VP8L') {
    if (bytes.byteLength < 25 || view.getUint8(20) !== 0x2f) return false
    const bits = view.getUint32(21, true)
    return validSide(1 + (bits & 0x3fff)) && validSide(1 + ((bits >>> 14) & 0x3fff))
  }
  if (chunk === 'VP8 ') {
    if (bytes.byteLength < 30 || view.getUint8(23) !== 0x9d || view.getUint8(24) !== 0x01 || view.getUint8(25) !== 0x2a) return false
    return validSide(view.getUint16(26, true) & 0x3fff) && validSide(view.getUint16(28, true) & 0x3fff)
  }
  return false
}

/** The image kind when `bytes` is a complete, well-formed PNG or WebP within the limits and `contentType` names that kind. */
export const validateThumbnail = (bytes: Uint8Array, contentType: string | null): ImageKind | undefined => {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMBNAIL_BYTES) return undefined
  const kind = sniffImage(bytes)
  if (kind === undefined || contentType?.split(';')[0]?.trim().toLowerCase() !== imageContentType(kind)) return undefined
  return (kind === 'png' ? validPng(bytes) : validWebp(bytes)) ? kind : undefined
}
