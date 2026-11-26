/**
 * BufferGeometry → MeshData for the formats read with three's own loaders (OBJ, PLY), and the triangle checks every
 * loader-made mesh goes through: a triangle with an index outside the vertices or a non-finite corner is dropped
 * (broken exporters, hostile files). If none remain, the model is `empty` (tree.ts `modelStats`).
 */
import { BufferAttribute, type BufferGeometry } from 'three'
import type { MeshData } from '../protocol'

/** One normal per triangle corner, from the corners themselves (unindexed triangles). */
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

const finiteVertex = (position: ArrayLike<number>, v: number) =>
  Number.isFinite(position[v * 3]) && Number.isFinite(position[v * 3 + 1]) && Number.isFinite(position[v * 3 + 2])

/** Indexed triangles: keeps those whose three indices are integers naming a vertex with finite coordinates. */
export const validIndex = (raw: ArrayLike<number>, position: Float32Array): Uint32Array => {
  const vertices = Math.floor(position.length / 3)
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < vertices && finiteVertex(position, i)
  const out = new Uint32Array(raw.length - (raw.length % 3))
  let n = 0
  for (let t = 0; t + 2 < raw.length; t += 3) {
    const a = raw[t]!
    const b = raw[t + 1]!
    const c = raw[t + 2]!
    if (!ok(a) || !ok(b) || !ok(c)) continue
    out[n++] = a
    out[n++] = b
    out[n++] = c
  }
  return n === out.length ? out : out.slice(0, n)
}

/**
 * Unindexed triangles: drops every triangle with a non-finite corner, from the positions and from each per-vertex array
 * (normals, colours: three floats per vertex). A per-vertex array of the wrong length is dropped (null).
 */
export const finiteTriangles = (position: Float32Array, perVertex: ReadonlyArray<Float32Array | null>): { position: Float32Array; perVertex: Array<Float32Array | null> } => {
  const usable = position.length - (position.length % 9)
  const arrays = perVertex.map((array) => (array !== null && array.length === position.length ? array : null))
  let bad = usable !== position.length
  for (let t = 0; t < usable / 9 && !bad; t++) if (!finiteVertex(position, t * 3) || !finiteVertex(position, t * 3 + 1) || !finiteVertex(position, t * 3 + 2)) bad = true
  if (!bad) return { position, perVertex: arrays }
  const out = new Float32Array(usable)
  const outs = arrays.map((array) => (array === null ? null : new Float32Array(usable)))
  let n = 0
  for (let at = 0; at < usable; at += 9) {
    const v = at / 3
    if (!finiteVertex(position, v) || !finiteVertex(position, v + 1) || !finiteVertex(position, v + 2)) continue
    out.set(position.subarray(at, at + 9), n)
    arrays.forEach((array, k) => outs[k]?.set(array!.subarray(at, at + 9), n))
    n += 9
  }
  return { position: out.slice(0, n), perVertex: outs.map((array) => array?.slice(0, n) ?? null) }
}

const floats = (geometry: BufferGeometry, name: string): Float32Array | null => {
  const attribute = geometry.getAttribute(name)
  if (attribute === undefined) return null
  const array = attribute.array
  // The loaders hand out Float32Array views; copy into a buffer of their own so it can be transferred alone.
  if (array instanceof Float32Array && !attribute.normalized) return array.slice()
  // Normalised integers (PLY colours as uint8): getComponent returns the 0..1 value.
  const out = new Float32Array(attribute.count * attribute.itemSize)
  for (let i = 0; i < attribute.count; i++)
    for (let k = 0; k < attribute.itemSize; k++) out[i * attribute.itemSize + k] = attribute.getComponent(i, k)
  return out
}

export const meshOfGeometry = (geometry: BufferGeometry, name: string): MeshData => {
  const position = floats(geometry, 'position') ?? new Float32Array(0)
  const color = floats(geometry, 'color')
  if (geometry.index === null) {
    const clean = finiteTriangles(position, [floats(geometry, 'normal'), color?.length === position.length ? color : null])
    const [normal, vertexColor] = clean.perVertex
    return { name, color: null, position: clean.position, normal: normal ?? flatNormals(clean.position), index: null, vertexColor: vertexColor ?? null, groups: [] }
  }
  const index = validIndex(geometry.index.array as ArrayLike<number>, position)
  let normal = floats(geometry, 'normal')
  if (normal === null || normal.length !== position.length) {
    // Normals from the kept triangles only: a dropped one must not spread NaN into its neighbours.
    geometry.setIndex(new BufferAttribute(index, 1))
    geometry.deleteAttribute('normal')
    geometry.computeVertexNormals()
    normal = floats(geometry, 'normal')
  }
  return { name, color: null, position, normal, index, vertexColor: color?.length === position.length ? color : null, groups: [] }
}
