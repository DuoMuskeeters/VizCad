/** STL (binary and ASCII). Flat normals are computed from the vertices; the stored facet normals are often zero. */
import { ParseFailure, type MeshData, type ParsedModel } from '../protocol'
import { normaliseTree } from '../../tree/tree'

export const flatNormals = (position: Float32Array): Float32Array => {
  const normal = new Float32Array(position.length)
  for (let i = 0; i + 8 < position.length; i += 9) {
    const ax = position[i + 3]! - position[i]!
    const ay = position[i + 4]! - position[i + 1]!
    const az = position[i + 5]! - position[i + 2]!
    const bx = position[i + 6]! - position[i]!
    const by = position[i + 7]! - position[i + 1]!
    const bz = position[i + 8]! - position[i + 2]!
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const length = Math.hypot(nx, ny, nz)
    if (length > 0) {
      nx /= length
      ny /= length
      nz /= length
    }
    for (let v = 0; v < 3; v++) {
      normal[i + v * 3] = nx
      normal[i + v * 3 + 1] = ny
      normal[i + v * 3 + 2] = nz
    }
  }
  return normal
}

const isBinary = (bytes: Uint8Array) => {
  if (bytes.byteLength < 84) return false
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
  if (84 + count * 50 === bytes.byteLength) return true
  // Some exporters write "solid" into the binary header; ASCII never has a NUL in its first bytes.
  const head = bytes.subarray(0, Math.min(bytes.byteLength, 512))
  return head.includes(0)
}

const readBinary = (bytes: Uint8Array): Float32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  if (84 + count * 50 > bytes.byteLength) throw new ParseFailure('corrupt', 'truncated binary STL')
  const position = new Float32Array(count * 9)
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12
    for (let k = 0; k < 9; k++) position[t * 9 + k] = view.getFloat32(at + k * 4, true)
  }
  return position
}

const readAscii = (bytes: Uint8Array): Float32Array => {
  const text = new TextDecoder().decode(bytes)
  const values: number[] = []
  const vertex = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g
  for (let match = vertex.exec(text); match !== null; match = vertex.exec(text)) values.push(Number(match[1]), Number(match[2]), Number(match[3]))
  if (values.some((v) => !Number.isFinite(v))) throw new ParseFailure('corrupt', 'bad STL number')
  const usable = values.length - (values.length % 9)
  return Float32Array.from(values.slice(0, usable))
}

export const parseStl = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const bytes = new Uint8Array(buffer)
  const position = isBinary(bytes) ? readBinary(bytes) : readAscii(bytes)
  const mesh: MeshData = { name, color: null, position, normal: flatNormals(position), index: null, vertexColor: null, groups: [] }
  return { meshes: [mesh], tree: normaliseTree({ name, meshes: [0], children: [] }, [mesh]), up: 'z' }
}
