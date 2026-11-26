/**
 * The only contract between the main thread and the parse Worker (docs/11 §1.2). Plain data, no three.js and no
 * `effect`: both sides import it. Geometry travels as typed arrays whose buffers are transferred, never copied.
 */

export type SourceFormat = 'step' | 'iges' | 'stl' | 'obj' | 'ply' | '3mf'

/**
 * Stable failure codes; each one has a text (`viewer.error.*`, docs/11 §8). `too_large` is the file size (over
 * `MAX_CONVERT_BYTES`, or a 3MF that expands past its budget); `too_complex` the node or triangle limit; `network` a
 * part of the viewer (the Worker chunk, the OCCT WASM) that could not be fetched.
 */
export type ErrorCode = 'empty' | 'unsupported' | 'too_large' | 'too_complex' | 'out_of_memory' | 'corrupt' | 'timeout' | 'network'

export const ERROR_CODES: ReadonlyArray<ErrorCode> = ['empty', 'unsupported', 'too_large', 'too_complex', 'out_of_memory', 'corrupt', 'timeout', 'network']

export type Rgb = readonly [number, number, number]

/** A run of triangles `[first, first + count)` drawn with one colour (b-rep face colours, 3MF materials). */
export type FaceGroup = { readonly first: number; readonly count: number; readonly color: Rgb | null }

/** One triangle mesh. Positions in millimetres in the source's own axes; `index` null means unindexed triangles. */
export type MeshData = {
  readonly name: string
  /** Linear 0..1 RGB; null takes the default material. */
  readonly color: Rgb | null
  readonly position: Float32Array
  readonly normal: Float32Array | null
  readonly index: Uint32Array | null
  /** Per-vertex linear RGB (PLY, OBJ extension); null when absent. */
  readonly vertexColor: Float32Array | null
  /** Empty, or groups that together cover every triangle. */
  readonly groups: ReadonlyArray<FaceGroup>
}

/**
 * One node of the model tree. `path` is the child-index path from the root (`0`, `0.3`, `0.3.2`, docs/11 §1.3); the
 * root is `0`. A node carries at most one mesh; a mesh may be shared by several nodes (3MF components, instancing).
 */
export type TreeNode = {
  readonly name: string
  readonly path: string
  readonly mesh: number | null
  /** Column-major 4×4 local transform; null is identity. */
  readonly matrix: ReadonlyArray<number> | null
  readonly children: ReadonlyArray<TreeNode>
}

export type Bounds = { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }

export type Stats = {
  readonly triangles: number
  readonly nodes: number
  /** Nodes that draw a mesh. */
  readonly parts: number
  readonly bbox: Bounds
  readonly ms: number
}

/** Source axes. STEP, IGES, STL, PLY and 3MF are Z-up by convention; OBJ is usually Y-up. */
export type UpAxis = 'z' | 'y'

export type ParsedModel = {
  readonly meshes: ReadonlyArray<MeshData>
  readonly tree: TreeNode
  readonly up: UpAxis
}

export type Stage = 'parse' | 'convert' | 'thumbnail'

export type WorkerRequest =
  | { readonly kind: 'parse'; readonly id: number; readonly format: SourceFormat; readonly name: string; readonly bytes: ArrayBuffer; readonly thumbnail: boolean }
  | { readonly kind: 'thumbnail'; readonly id: number; readonly format: SourceFormat; readonly name: string; readonly bytes: ArrayBuffer }

export type WorkerResponse =
  | { readonly kind: 'progress'; readonly id: number; readonly stage: Stage; readonly ratio: number | null }
  | { readonly kind: 'parsed'; readonly id: number; readonly model: ParsedModel; readonly stats: Stats; readonly thumbnail: Blob | null }
  | { readonly kind: 'thumbnail'; readonly id: number; readonly blob: Blob }
  | { readonly kind: 'failed'; readonly id: number; readonly code: ErrorCode }

/** Limits the viewer enforces on any model it builds (docs/11 §2.3 "Güven"). */
export const MAX_TRIANGLES = 20_000_000
export const MAX_NODES = 20_000

/**
 * Largest STEP/IGES/3MF the browser converts (D22: about 50 MB; the 2 GB WASM heap is the real ceiling). 5b moves this
 * value into `Entitlements.maxConvertBytes`; until then it is a device-capability guard of the viewer, not a plan limit.
 */
export const MAX_CONVERT_BYTES = 50 * 1024 * 1024

/** STEP/IGES conversion gives up after five minutes (docs/11 §1.2; a 179 MB file returned empty after 11.7 min). */
export const PARSE_TIMEOUT_MS = 5 * 60 * 1000

export const isConvertFormat = (format: SourceFormat) => format === 'step' || format === 'iges' || format === '3mf'

export const formatOfExtension = (extension: string): SourceFormat | null => {
  switch (extension.toLowerCase()) {
    case 'step':
    case 'stp':
      return 'step'
    case 'iges':
    case 'igs':
      return 'iges'
    case 'stl':
      return 'stl'
    case 'obj':
      return 'obj'
    case 'ply':
      return 'ply'
    case '3mf':
      return '3mf'
    default:
      return null
  }
}

/** Buffers to transfer with a `parsed` answer: each one once, even when meshes share nothing. */
export const transferablesOf = (model: ParsedModel): ArrayBuffer[] => {
  const seen = new Set<ArrayBuffer>()
  for (const mesh of model.meshes)
    for (const array of [mesh.position, mesh.normal, mesh.index, mesh.vertexColor])
      if (array !== null && array.buffer instanceof ArrayBuffer) seen.add(array.buffer)
  return [...seen]
}

/** A failure the format code raises on purpose; anything else is classified by `classifyError`. */
export class ParseFailure extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'ParseFailure'
  }
}

/** Maps a thrown value to a code: memory exhaustion is `out_of_memory`, everything else unreadable input. */
export const classifyError = (error: unknown): ErrorCode => {
  if (error instanceof ParseFailure) return error.code
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (/out of memory|OOM|Array buffer allocation failed|Invalid array length|Cannot enlarge memory|memory\.grow/i.test(text)) return 'out_of_memory'
  return 'corrupt'
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Narrow check of an incoming message on either side; a malformed message is dropped. */
export const isWorkerResponse = (value: unknown): value is WorkerResponse =>
  isObject(value) && typeof value['id'] === 'number' && ['progress', 'parsed', 'thumbnail', 'failed'].includes(String(value['kind']))

export const isWorkerRequest = (value: unknown): value is WorkerRequest =>
  isObject(value)
  && typeof value['id'] === 'number'
  && (value['kind'] === 'parse' || value['kind'] === 'thumbnail')
  && typeof value['format'] === 'string'
  && value['bytes'] instanceof ArrayBuffer
