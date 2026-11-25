import { attachmentDisposition } from './services/r2Presign'

/**
 * Pure parts of file delivery (docs/09 §3): the Range header, the safe response headers and the thumbnail sniffing.
 * No I/O, so every branch is tested without storage.
 */

export type ByteRange =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' }

const digits = /^\d{1,15}$/
/** A name from a legacy row may hold a lone surrogate, which `encodeURIComponent` refuses. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Resolves a `Range` header against the object's size. Only a single `bytes=` range is served; anything else (several
 * ranges, another unit, malformed text, last < first) is ignored and the whole object is sent, as RFC 9110 allows.
 * A range that starts past the end is unsatisfiable (416).
 */
export const parseRange = (header: string | null, size: number): ByteRange => {
  const full = { kind: 'full' } as const
  if (header === null || !header.startsWith('bytes=') || header.includes(',')) return full
  const [first = '', last = '', extra] = header.slice('bytes='.length).trim().split('-')
  if (extra !== undefined) return full
  if (first === '') {
    // Suffix range: the last `n` bytes.
    if (!digits.test(last)) return full
    const n = Number(last)
    return n === 0 || size === 0 ? { kind: 'unsatisfiable' } : { kind: 'partial', start: Math.max(0, size - n), end: size - 1 }
  }
  if (!digits.test(first) || (last !== '' && !digits.test(last))) return full
  const start = Number(first)
  const end = last === '' ? size - 1 : Number(last)
  if (last !== '' && end < start) return full
  if (start >= size) return { kind: 'unsatisfiable' }
  return { kind: 'partial', start, end: Math.min(end, size - 1) }
}

/** Control characters and bidirectional marks a legacy name may hold: they would hide the real extension or break the header. */
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** Response headers every delivery of user content carries (docs/09 §3.1): never rendered, never cached, never sniffed. */
export const safeHeaders = (extra: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  'x-content-type-options': 'nosniff',
  'content-security-policy': 'sandbox',
  'cache-control': 'private, no-store',
  'cross-origin-resource-policy': 'same-origin',
  ...extra,
})

/** Headers of a content (download) response; `range` is the resolved partial range, if any. */
export const contentHeaders = (name: string, size: number, range: ByteRange): Record<string, string> => {
  const partial = range.kind === 'partial'
  return safeHeaders({
    'content-type': 'application/octet-stream',
    'content-disposition': attachmentDisposition(name.replace(LONE_SURROGATE, '\uFFFD').replace(CONTROL_OR_BIDI, '_')),
    'accept-ranges': 'bytes',
    'content-length': String(partial ? range.end - range.start + 1 : size),
    ...(partial ? { 'content-range': `bytes ${range.start}-${range.end}/${size}` } : {}),
  })
}

export const rangeNotSatisfiableHeaders = (size: number): Record<string, string> =>
  safeHeaders({ 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes', 'content-length': '0' })

/** Largest thumbnail delivered or accepted (docs/09 §3.1). */
export const MAX_THUMBNAIL_BYTES = 1024 * 1024

export type ImageKind = 'png' | 'webp'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))

/** PNG or WebP by magic bytes alone. Thumbnails of legacy files were never validated more deeply than this. */
export const sniffImage = (bytes: Uint8Array): ImageKind | undefined => {
  if (bytes.byteLength >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return 'png'
  if (bytes.byteLength >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  return undefined
}

export const imageContentType = (kind: ImageKind) => (kind === 'png' ? 'image/png' : 'image/webp')

/** Headers of a thumbnail response: a fixed image type, never what the object claims to be. */
export const thumbnailHeaders = (kind: ImageKind, size: number): Record<string, string> =>
  safeHeaders({ 'content-type': imageContentType(kind), 'content-length': String(size) })
