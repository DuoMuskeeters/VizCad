/**
 * Reads a GLB derivative for the viewer (docs/11 §2.4), on the main thread: no Worker and no WASM, the bytes are
 * already triangles. Loaded lazily, only when `model` answers `model/gltf-binary`. The derivative's Y-up root
 * (`scene/glb.ts`) is turned back into the viewer's Z-up world. Limits of §2.3 "Güven" apply: a GLB claiming more
 * nodes or triangles than the viewer accepts is refused before anything reaches the GPU.
 */
import { Box3, type BufferGeometry, Group, type Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MAX_NODES, MAX_TRIANGLES, ParseFailure, type Stats } from '../worker/protocol'
import { disposeObject } from './dispose'

const trianglesOf = (geometry: BufferGeometry) => Math.floor((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3)

/** Statistics of a loaded tree, in the same terms as the Worker's (`Stats`): node paths, drawn parts, triangles. */
export const statsOfObject = (root: Object3D, ms: number): Stats => {
  let triangles = 0
  let nodes = 0
  let parts = 0
  root.traverse((object) => {
    if (typeof object.userData['vizcadPath'] === 'string') {
      nodes++
      // A node draws when it is a mesh or holds the primitives GLTFLoader split a multi-material mesh into.
      const drawn = (object as Mesh).isMesh || object.children.some((child) => (child as Mesh).isMesh && typeof child.userData['vizcadPath'] !== 'string')
      if (drawn) parts++
    }
    const mesh = object as Mesh
    if (mesh.isMesh) triangles += trianglesOf(mesh.geometry)
  })
  const box = new Box3().setFromObject(root)
  return {
    triangles,
    nodes,
    parts,
    bbox: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] },
    ms,
  }
}

/** Parses GLB bytes into a Z-up root ready for `SceneHandle.setModel`, or a ParseFailure (`corrupt`, `empty`, `too_complex`). */
export const loadGlb = async (bytes: ArrayBuffer, now: () => number = () => performance.now()): Promise<{ root: Group; stats: Stats }> => {
  const started = now()
  let scene: Object3D
  try {
    scene = (await new GLTFLoader().parseAsync(bytes, '')).scene
  } catch {
    throw new ParseFailure('corrupt', 'GLB could not be parsed')
  }
  const root = new Group()
  root.name = 'model'
  root.rotation.x = Math.PI / 2
  root.add(scene)
  root.updateMatrixWorld(true)
  let objects = 0
  scene.traverse(() => void objects++)
  // Primitives of multi-material meshes add objects without paths; a GLB of ours stays within twice the node limit.
  if (objects > 2 * MAX_NODES) {
    disposeObject(root)
    throw new ParseFailure('too_complex', 'too many nodes')
  }
  const stats = statsOfObject(root, now() - started)
  if (stats.nodes > MAX_NODES || stats.triangles > MAX_TRIANGLES) {
    disposeObject(root)
    throw new ParseFailure('too_complex')
  }
  const finite = [...stats.bbox.min, ...stats.bbox.max].every(Number.isFinite)
  if (stats.triangles === 0 || !finite) {
    disposeObject(root)
    throw new ParseFailure(stats.triangles === 0 ? 'empty' : 'corrupt')
  }
  return { root, stats }
}
