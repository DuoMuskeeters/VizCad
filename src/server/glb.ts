/**
 * The GLB header check of `completeDerivative` (docs/11 §2.3). Pure: it reads the first 20 bytes R2 returns and the
 * object's size from HEAD, never the whole file. A binary glTF starts with a 12-byte header (`glTF` magic, version,
 * total length) and a chunk header (length, type); the first chunk must be the JSON chunk (glTF 2.0 §4.4).
 */

/** Bytes the check reads: the file header (12) and the first chunk header (8). */
export const GLB_HEADER_BYTES = 20

const MAGIC = 0x46546c67 // 'glTF' little endian
const VERSION = 2
const CHUNK_JSON = 0x4e4f534a // 'JSON' little endian

export type GlbHeaderProblem = 'short' | 'magic' | 'version' | 'length' | 'chunk'

/**
 * `undefined` when `head` is a plausible GLB header for an object of `size` bytes; otherwise the first problem found.
 * The JSON chunk must be non-empty, 4-byte aligned (§4.4.3) and fit inside the declared length.
 */
export const glbHeaderProblem = (head: Uint8Array, size: number): GlbHeaderProblem | undefined => {
  if (head.byteLength < GLB_HEADER_BYTES || size < GLB_HEADER_BYTES) return 'short'
  const view = new DataView(head.buffer, head.byteOffset, GLB_HEADER_BYTES)
  if (view.getUint32(0, true) !== MAGIC) return 'magic'
  if (view.getUint32(4, true) !== VERSION) return 'version'
  const length = view.getUint32(8, true)
  if (length !== size || length % 4 !== 0) return 'length'
  const chunkLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== CHUNK_JSON || chunkLength === 0 || chunkLength % 4 !== 0 || chunkLength > length - GLB_HEADER_BYTES) return 'chunk'
  return undefined
}

export const isValidGlbHeader = (head: Uint8Array, size: number) => glbHeaderProblem(head, size) === undefined
