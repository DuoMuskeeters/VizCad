/**
 * STL (binary and ASCII). Flat normals are computed from the vertices; the stored facet normals are often zero. A
 * triangle with a non-finite corner (NaN, Infinity, a garbled ASCII number) is dropped; none left is `empty`.
 */
import { ParseFailure, type MeshData, type ParsedModel } from '../protocol'
import { normaliseTree } from '../../tree/tree'
import { finiteTriangles, flatNormals } from './geometry'

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
  const usable = values.length - (values.length % 9)
  return Float32Array.from(values.slice(0, usable))
}

export const parseStl = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const bytes = new Uint8Array(buffer)
  const { position } = finiteTriangles(isBinary(bytes) ? readBinary(bytes) : readAscii(bytes), [])
  const mesh: MeshData = { name, color: null, position, normal: flatNormals(position), index: null, vertexColor: null, groups: [] }
  return { meshes: [mesh], tree: normaliseTree({ name, meshes: [0], children: [] }, [mesh]), up: 'z' }
}
