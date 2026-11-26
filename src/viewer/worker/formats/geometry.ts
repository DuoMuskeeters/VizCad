/** BufferGeometry → MeshData, for the formats read with three's own loaders (OBJ, PLY). */
import type { BufferGeometry } from 'three'
import type { MeshData } from '../protocol'
import { flatNormals } from './stl'

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
  const index = geometry.index === null ? null : Uint32Array.from(geometry.index.array as ArrayLike<number>)
  let normal = floats(geometry, 'normal')
  if (normal === null) {
    if (index === null) normal = flatNormals(position)
    else {
      geometry.computeVertexNormals()
      normal = floats(geometry, 'normal')
    }
  }
  return { name, color: null, position, normal, index, vertexColor: floats(geometry, 'color'), groups: [] }
}
