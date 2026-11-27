/**
 * One node of the model as a binary STL (docs/11 §4.3, B7): every triangle of every mesh under it, in the viewer's
 * Z-up world, which is the file's own axes in model units (a GLB's Y-up root is turned back at load). Loaded lazily,
 * only when someone downloads a part. Hidden parts under the node are included: the export is the part, not the screen.
 */
import { Box3, type BufferAttribute, type Mesh, type Object3D, Vector3 } from 'three'

/** 80-byte header + count, then 50 bytes per triangle (normal, three corners, attribute count). */
export const stlBytes = (triangles: number) => 84 + 50 * triangles

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
 * Writes the node's triangles. `centered`: the bounding box centre moves to the origin (for a slicer); otherwise the
 * part keeps its place in the assembly (B7 default).
 */
export const writeStl = (object: Object3D, options: { readonly centered: boolean; readonly name: string }): ArrayBuffer => {
  object.updateWorldMatrix(true, true)
  const meshes = meshesOf(object)
  const total = meshes.reduce((n, mesh) => n + trianglesIn(mesh), 0)
  const offset = new Vector3()
  if (options.centered) new Box3().setFromObject(object).getCenter(offset)
  const buffer = new ArrayBuffer(stlBytes(total))
  const view = new DataView(buffer)
  // Header: ASCII only, and never starting with "solid" (some readers would take the file for text STL).
  const header = `VizCad part ${options.name}`.replace(/[^\x20-\x7e]/g, '_').slice(0, 80)
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, total, true)
  let at = 84
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
    for (let t = 0; t < count; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld).sub(offset)
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld).sub(offset)
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld).sub(offset)
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
  return buffer
}
