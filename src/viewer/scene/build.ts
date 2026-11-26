/**
 * ParsedModel → three.js objects, on the main thread and in the Worker (thumbnails). One Object3D per tree node: a
 * leaf with a mesh is a `Mesh`, every other node a `Group`. Each object carries its node path in
 * `userData.vizcadPath`, which GLTFExporter writes as `node.extras.vizcadPath` (docs/11 §1.3, used from 5b on).
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LinearSRGBColorSpace, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { MeshData, ParsedModel, Rgb, TreeNode } from '../worker/protocol'

/** Neutral part colour on the dark canvas (sRGB). */
export const DEFAULT_PART_COLOR = 0xb8c4d0

type MaterialKey = string

const keyOf = (color: Rgb | null, flat: boolean, vertexColors: boolean): MaterialKey =>
  `${color ? color.map((c) => c.toFixed(4)).join(',') : 'default'}|${flat ? 'f' : 's'}|${vertexColors ? 'v' : '-'}`

export const geometryOf = (mesh: MeshData): BufferGeometry => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.position, 3))
  if (mesh.normal !== null) geometry.setAttribute('normal', new BufferAttribute(mesh.normal, 3))
  if (mesh.vertexColor !== null) geometry.setAttribute('color', new BufferAttribute(mesh.vertexColor, 3))
  if (mesh.index !== null) geometry.setIndex(new BufferAttribute(mesh.index, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** Builds the object tree. Geometries are created once per mesh and shared by every node that draws it. */
export const buildModel = (model: ParsedModel): Group => {
  const materials = new Map<MaterialKey, MeshStandardMaterial>()
  const material = (color: Rgb | null, flat: boolean, vertexColors: boolean) => {
    const key = keyOf(color, flat, vertexColors)
    let m = materials.get(key)
    if (m === undefined) {
      m = new MeshStandardMaterial({
        color: color ? new Color().setRGB(color[0], color[1], color[2], LinearSRGBColorSpace) : new Color(DEFAULT_PART_COLOR),
        metalness: 0.1,
        roughness: 0.6,
        // CAD exports do not agree on winding; both sides keep a part from looking hollow.
        side: DoubleSide,
        flatShading: flat,
        vertexColors,
      })
      materials.set(key, m)
    }
    return m
  }
  const geometries = new Map<number, BufferGeometry>()
  const meshFor = (index: number) => {
    const data = model.meshes[index]
    if (data === undefined) return null
    let geometry = geometries.get(index)
    if (geometry === undefined) {
      geometry = geometryOf(data)
      // Groups are in index (or vertex) units: three per triangle in both cases.
      data.groups.forEach((group, i) => geometry!.addGroup(group.first * 3, group.count * 3, i))
      geometries.set(index, geometry)
    }
    const flat = data.normal === null
    const vertexColors = data.vertexColor !== null
    return data.groups.length > 0
      ? new Mesh(geometry, data.groups.map((group) => material(group.color ?? data.color, flat, vertexColors)))
      : new Mesh(geometry, material(data.color, flat, vertexColors))
  }
  const build = (node: TreeNode): Object3D => {
    const object = (node.mesh !== null && node.children.length === 0 ? meshFor(node.mesh) : null) ?? new Group()
    object.name = node.name
    object.userData['vizcadPath'] = node.path
    if (node.matrix !== null) {
      object.matrix.fromArray(node.matrix)
      object.matrix.decompose(object.position, object.quaternion, object.scale)
    }
    for (const child of node.children) object.add(build(child))
    return object
  }
  const root = new Group()
  root.name = 'model'
  // The viewer's world is Z-up (CAD convention); a Y-up source (OBJ) is turned once at the top.
  if (model.up === 'y') root.rotation.x = Math.PI / 2
  root.add(build(model.tree))
  root.updateMatrixWorld(true)
  return root
}
