/**
 * Reads a GLB derivative for the viewer (docs/11 §2.4), on the main thread: no Worker and no WASM, the bytes are
 * already triangles. Loaded lazily, only when `model` answers `model/gltf-binary`. The derivative's Y-up root
 * (`scene/glb.ts`) is turned back into the viewer's Z-up world. Limits of §2.3 "Güven" apply: a GLB claiming more
 * nodes or triangles than the viewer accepts is refused before anything reaches the GPU.
 */
import { Box3, type BufferGeometry, Group, LoadingManager, type Mesh, type Object3D } from 'three'
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

const embedded = (uri: unknown) => typeof uri !== 'string' || /^(data|blob):/i.test(uri)

/**
 * Every `uri` of the GLB's buffers and images is embedded (`data:`), read from the JSON chunk before GLTFLoader sees
 * it. False also for bytes whose JSON chunk cannot be read (GLTFLoader would refuse them anyway).
 */
export const onlyEmbeddedUris = (bytes: ArrayBuffer): boolean => {
  if (bytes.byteLength < 20) return false
  const view = new DataView(bytes)
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.byteLength) return false
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)))
  } catch {
    return false
  }
  if (typeof json !== 'object' || json === null) return false
  const listed = (key: string): unknown[] => {
    const value: unknown = (json as Record<string, unknown>)[key]
    return Array.isArray(value) ? value : []
  }
  return [...listed('buffers'), ...listed('images')].every((entry) => typeof entry !== 'object' || entry === null || embedded((entry as { uri?: unknown }).uri))
}

/** Parses GLB bytes into a Z-up root ready for `SceneHandle.setModel`, or a ParseFailure (`corrupt`, `empty`, `too_complex`). */
export const loadGlb = async (bytes: ArrayBuffer, now: () => number = () => performance.now()): Promise<{ root: Group; stats: Stats }> => {
  const started = now()
  // A GLB of ours carries everything in its BIN chunk; GLTFLoader itself only makes blob: URLs for embedded images.
  // Any other URI (http:, a relative path) would make the viewer fetch something the file names: refused before
  // parsing, and, should one slip through, swapped for an empty data: URL by the manager so nothing is requested.
  if (!onlyEmbeddedUris(bytes)) throw new ParseFailure('corrupt', 'GLB refers to an external URI')
  let external = false
  const manager = new LoadingManager()
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url
    external = true
    return 'data:,'
  })
  let scene: Object3D | null = null
  try {
    scene = (await new GLTFLoader(manager).parseAsync(bytes, '')).scene
  } catch {
    scene = null
  }
  if (external || scene === null) {
    if (scene !== null) disposeObject(scene)
    throw new ParseFailure('corrupt', external ? 'GLB refers to an external URI' : 'GLB could not be parsed')
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
