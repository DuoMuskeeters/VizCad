/**
 * Supported CAD file types and their content signatures (docs/09 §2.2, D15). Plain TypeScript with no Effect and no
 * Worker APIs: the browser uses it to reject a file before uploading, the server to validate the bytes R2 holds.
 * The browser check is only user experience; `completeUpload` is the one that counts.
 */

export type FileTypeId = 'step' | 'iges' | 'stl' | 'obj' | 'ply' | '3mf'

export interface FileType {
  readonly id: FileTypeId
  readonly label: string
  /** Lower case, without the dot. */
  readonly extensions: ReadonlyArray<string>
  /** The MIME value stored in `files.mimeType`; chosen here from the extension, never from the client's declaration. */
  readonly mimeType: string
}

export const fileTypes: ReadonlyArray<FileType> = [
  { id: 'step', label: 'STEP', extensions: ['step', 'stp'], mimeType: 'model/step' },
  { id: 'iges', label: 'IGES', extensions: ['iges', 'igs'], mimeType: 'model/iges' },
  { id: 'stl', label: 'STL', extensions: ['stl'], mimeType: 'model/stl' },
  { id: 'obj', label: 'OBJ', extensions: ['obj'], mimeType: 'model/obj' },
  { id: 'ply', label: 'PLY', extensions: ['ply'], mimeType: 'application/x-ply' },
  { id: '3mf', label: '3MF', extensions: ['3mf'], mimeType: 'model/3mf' },
]

/** Extension of a file name, lower case and without the dot; empty when there is none. */
export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}

export const fileTypeOfExtension = (extension: string): FileType | undefined =>
  fileTypes.find((type) => type.extensions.includes(extension.toLowerCase()))

/** Every accepted extension with its dot, for the `accept` attribute of a file input. */
export const acceptedExtensions = fileTypes.flatMap((type) => type.extensions.map((extension) => `.${extension}`))

/** "STEP (.step, .stp), IGES (.iges, .igs), STL (.stl), ..." for the unsupported-type message. */
export const supportedTypesText = fileTypes
  .map((type) => `${type.label} (${type.extensions.map((extension) => `.${extension}`).join(', ')})`)
  .join(', ')

export const MAX_NAME_LENGTH = 255

/** A name the product accepts: 1-255 characters, no control characters, no `/` or `\`, no bidirectional controls. */
export const isValidFileName = (name: string) =>
  name.length >= 1 && name.length <= MAX_NAME_LENGTH && name.trim().length > 0
  // eslint-disable-next-line no-control-regex
  && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\/\\]/.test(name)

/** How many leading (and, for 3MF, trailing) bytes the signature checks read. */
export const SIGNATURE_BYTES = 64 * 1024

/** Only 3MF reads the end of the file (the ZIP central directory). */
export const signatureNeedsTail = (type: FileTypeId) => type === '3mf'

export interface SignatureSample {
  /** Total object size in bytes. */
  readonly size: number
  /** The first `min(size, SIGNATURE_BYTES)` bytes. */
  readonly head: Uint8Array
  /** The last `min(size, SIGNATURE_BYTES)` bytes; required for 3MF only. */
  readonly tail?: Uint8Array | undefined
}

const ascii = (bytes: Uint8Array, start = 0, end = bytes.length) => {
  let out = ''
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i] ?? 0)
  return out
}

const hasNul = (bytes: Uint8Array) => bytes.includes(0)

const startsWithBytes = (bytes: Uint8Array, prefix: ReadonlyArray<number>) => prefix.every((byte, i) => bytes[i] === byte)

const isStep = ({ head }: SignatureSample) => {
  let start = startsWithBytes(head, [0xef, 0xbb, 0xbf]) ? 3 : 0
  while (start < head.length && [0x20, 0x09, 0x0a, 0x0d].includes(head[start] ?? -1)) start++
  return ascii(head, start, start + 13) === 'ISO-10303-21;'
}

/** First line of an IGES file is an 80 column "Start" record: column 73 is `S`. */
const isIges = ({ head }: SignatureSample) => {
  let end = head.indexOf(0x0a)
  if (end < 0) return false
  if (end > 0 && head[end - 1] === 0x0d) end--
  if (end !== 80) return false
  for (let i = 0; i < end; i++) {
    const byte = head[i] ?? 0
    if (byte < 0x20 || byte > 0x7e) return false
  }
  return head[72] === 0x53
}

const isStl = ({ head, size }: SignatureSample) => {
  if (size >= 84 && head.length >= 84) {
    const triangles = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(80, true)
    if (size === 84 + 50 * triangles) return true
  }
  if (hasNul(head)) return false
  let start = 0
  while (start < head.length && [0x20, 0x09, 0x0a, 0x0d].includes(head[start] ?? -1)) start++
  return ascii(head, start, start + 5).toLowerCase() === 'solid' && ascii(head).toLowerCase().includes('facet')
}

const isObj = ({ head, size }: SignatureSample) => {
  if (hasNul(head)) return false
  // A cut at the sample boundary can split one multi-byte character; drop that incomplete tail before decoding.
  let end = head.length
  if (size > head.length) {
    let back = 0
    while (back < 3 && end - back > 0 && ((head[end - back - 1] ?? 0) & 0xc0) === 0x80) back++
    const lead = head[end - back - 1] ?? 0
    const expected = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
    if (expected > back + 1) end = end - back - 1
  }
  // Non-fatal decode: invalid UTF-8 becomes U+FFFD, which makes the sample invalid.
  const text = new TextDecoder('utf-8').decode(head.subarray(0, end))
  if (text.includes('\uFFFD')) return false
  return /^[ \t]*(?:v |f |o |g |mtllib)/m.test(text)
}

const isPly = ({ head }: SignatureSample) => {
  const text = ascii(head, 0, 64)
  return /^ply\r?\nformat /.test(text)
}

const CENTRAL_ENTRY = [0x50, 0x4b, 0x01, 0x02]
const END_OF_CENTRAL = [0x50, 0x4b, 0x05, 0x06]

const find = (bytes: Uint8Array, pattern: ReadonlyArray<number>, from: number, backwards = false) => {
  if (backwards) {
    for (let i = Math.min(from, bytes.length - pattern.length); i >= 0; i--) if (pattern.every((byte, j) => bytes[i + j] === byte)) return i
  } else {
    for (let i = Math.max(from, 0); i <= bytes.length - pattern.length; i++) if (pattern.every((byte, j) => bytes[i + j] === byte)) return i
  }
  return -1
}

const MODEL_ENTRY = '3D/3dmodel.model'

const is3mf = ({ head, tail, size }: SignatureSample) => {
  if (!startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04]) || tail === undefined) return false
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  const eocd = find(tail, END_OF_CENTRAL, tail.length, true)
  if (eocd < 0 || eocd + 20 > tail.length) return false
  const directoryOffset = view.getUint32(eocd + 16, true)
  const tailStart = size - tail.length
  // The directory normally lies inside the sampled tail; a huge one starts earlier, so read from its first entry here.
  let at = directoryOffset >= tailStart ? directoryOffset - tailStart : find(tail, CENTRAL_ENTRY, 0)
  while (at >= 0 && at + 46 <= eocd && startsWithBytes(tail.subarray(at), CENTRAL_ENTRY)) {
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    if (at + 46 + nameLength > tail.length) return false
    if (ascii(tail, at + 46, at + 46 + nameLength) === MODEL_ENTRY) return true
    at += 46 + nameLength + extraLength + commentLength
  }
  return false
}

const checks: Record<FileTypeId, (sample: SignatureSample) => boolean> = {
  step: isStep,
  iges: isIges,
  stl: isStl,
  obj: isObj,
  ply: isPly,
  '3mf': is3mf,
}

/** True when the sampled bytes look like the declared type. An HTML page named `.stl` fails here. */
export const hasValidSignature = (type: FileTypeId, sample: SignatureSample) => checks[type](sample)
