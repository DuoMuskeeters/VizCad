/**
 * One node of the model as a binary STL (docs/11 §4.3, B7): every triangle of every mesh under it, in model units and
 * in the viewer's Z-up world. For a Z-up source (STEP, IGES, 3MF, STL, PLY) that is the file's own axes; a Y-up
 * source (OBJ, a Y-up GLB) was turned at load, so its part comes out Z-up, as slicers expect. Loaded lazily, only
 * when someone downloads a part. Hidden parts under the node are included: the export is the part, not the screen.
 */
import { Box3, type BufferAttribute, type Mesh, type Object3D, Vector3 } from 'three'
import { STL_CHUNK_TRIANGLES, STL_MAX_BYTES, stlBytes } from '../../shared/stl'

export { stlBytes }

const meshesOf = (object: Object3D): Mesh[] => {
  const out: Mesh[] = []
  object.traverse((child) => {
    if ((child as Mesh).isMesh) out.push(child as Mesh)
  })
  return out
}

const trianglesIn = (mesh: Mesh) => {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
  if (!position) return 0
  return Math.floor((mesh.geometry.index?.count ?? position.count) / 3)
}

export const countTriangles = (object: Object3D) => meshesOf(object).reduce((n, mesh) => n + trianglesIn(mesh), 0)

/**
 * Writes the node's triangles as pieces of a binary STL (header first), to be joined by a `Blob`; null past
 * `STL_MAX_BYTES`. `centered`: the bounding box centre moves to the origin (for a slicer); otherwise the part keeps
 * its place in the assembly (B7 default). A mirrored instance (negative determinant) has its corners swapped, so its
 * faces still point outwards.
 */
export const writeStl = (object: Object3D, options: { readonly centered: boolean; readonly name: string }): ArrayBuffer[] | null => {
  object.updateWorldMatrix(true, true)
  const meshes = meshesOf(object)
  const total = meshes.reduce((n, mesh) => n + trianglesIn(mesh), 0)
  if (stlBytes(total) > STL_MAX_BYTES) return null
  const offset = new Vector3()
  if (options.centered) new Box3().setFromObject(object).getCenter(offset)
  const head = new ArrayBuffer(84)
  const headView = new DataView(head)
  // Header: ASCII only, and never starting with "solid" (some readers would take the file for text STL).
  const header = `VizCad part ${options.name}`.replace(/[^\x20-\x7e]/g, '_').slice(0, 80)
  for (let i = 0; i < header.length; i++) headView.setUint8(i, header.charCodeAt(i))
  headView.setUint32(80, total, true)
  const pieces: ArrayBuffer[] = [head]
  let left = total
  let view = new DataView(new ArrayBuffer(0))
  let at = 0
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
    if (!position) continue
    const index = mesh.geometry.index
    const count = trianglesIn(mesh)
    const mirrored = mesh.matrixWorld.determinant() < 0
    for (let t = 0; t < count; t++) {
      if (at === view.byteLength) {
        const size = Math.min(left, STL_CHUNK_TRIANGLES) * 50
        const piece = new ArrayBuffer(size)
        pieces.push(piece)
        view = new DataView(piece)
        at = 0
        left -= size / 50
      }
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld).sub(offset)
      b.fromBufferAttribute(position, mirrored ? i2 : i1).applyMatrix4(mesh.matrixWorld).sub(offset)
      c.fromBufferAttribute(position, mirrored ? i1 : i2).applyMatrix4(mesh.matrixWorld).sub(offset)
      const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a))
      if (normal.lengthSq() > 0) normal.normalize()
      for (const v of [normal, a, b, c]) {
        view.setFloat32(at, v.x, true)
        view.setFloat32(at + 4, v.y, true)
        view.setFloat32(at + 8, v.z, true)
        at += 12
      }
      view.setUint16(at, 0, true)
      at += 2
    }
  }
  return pieces
}
