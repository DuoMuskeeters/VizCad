/**
 * STEP and IGES with occt-import-js (LGPL-2.1, loaded unmodified as its own WASM file; licence at
 * /licenses/occt-import-js.txt). The module is injected: the Worker loads it with the WASM URL, Node tests with `require`.
 */
import { ParseFailure, type FaceGroup, type MeshData, type ParsedModel, type Rgb } from '../protocol'
import { normaliseTree, type RawNode } from '../../tree/tree'

type OcctNode = { readonly name?: string; readonly meshes?: ReadonlyArray<number>; readonly children?: ReadonlyArray<OcctNode> }
type OcctMesh = {
  readonly name?: string
  readonly color?: ReadonlyArray<number>
  readonly brep_faces?: ReadonlyArray<{ readonly first: number; readonly last: number; readonly color: ReadonlyArray<number> | null }>
  readonly attributes: { readonly position: { readonly array: ArrayLike<number> }; readonly normal?: { readonly array: ArrayLike<number> } }
  readonly index: { readonly array: ArrayLike<number> }
}
export type OcctResult = { readonly success: boolean; readonly root: OcctNode; readonly meshes: ReadonlyArray<OcctMesh> }

export type Occt = {
  ReadFile: (format: 'step' | 'iges' | 'brep', content: Uint8Array, params: Record<string, unknown> | null) => OcctResult
}

/** Same triangulation as the benchmark (docs/10 §3.1): millimetres, deflection relative to the bounding box. */
export const TRIANGULATION = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 } as const

/**
 * Pure black counts as "no colour": IGES exports (and some STEP ones) write it as their default, and a black part
 * disappears on the dark canvas. A part really meant to be black shows in the neutral part colour instead.
 */
const rgb = (value: ReadonlyArray<number> | null | undefined): Rgb | null => {
  if (!value || value.length < 3) return null
  const color: Rgb = [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]
  return color.every((c) => c < 0.004) ? null : color
}

/** Face colours as groups that cover every triangle; uncoloured runs take the mesh colour. */
export const faceGroups = (mesh: OcctMesh, triangles: number): FaceGroup[] => {
  const faces = (mesh.brep_faces ?? []).filter((face) => rgb(face.color) !== null).slice().sort((a, b) => a.first - b.first)
  if (faces.length === 0) return []
  const base = rgb(mesh.color)
  const groups: FaceGroup[] = []
  let at = 0
  for (const face of faces) {
    const first = Math.max(face.first, at)
    const last = Math.min(face.last, triangles - 1)
    if (last < first) continue
    if (first > at) groups.push({ first: at, count: first - at, color: base })
    groups.push({ first, count: last - first + 1, color: rgb(face.color) })
    at = last + 1
  }
  if (at < triangles) groups.push({ first: at, count: triangles - at, color: base })
  return groups
}

const toRaw = (node: OcctNode): RawNode => ({ name: node.name ?? '', meshes: node.meshes ?? [], children: (node.children ?? []).map(toRaw) })

export const parseCad = (occt: Occt, format: 'step' | 'iges', buffer: ArrayBuffer, name: string): ParsedModel => {
  const result = occt.ReadFile(format, new Uint8Array(buffer), TRIANGULATION)
  if (!result.success) throw new ParseFailure('corrupt', 'occt could not read the file')
  const meshes: MeshData[] = result.meshes.map((mesh) => {
    const position = Float32Array.from(mesh.attributes.position.array)
    const index = Uint32Array.from(mesh.index.array)
    return {
      name: mesh.name ?? '',
      color: rgb(mesh.color),
      position,
      normal: mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : null,
      index,
      vertexColor: null,
      groups: faceGroups(mesh, index.length / 3),
    }
  })
  const root = toRaw(result.root)
  return { meshes, tree: normaliseTree({ ...root, name: root.name || name }, meshes), up: 'z' }
}
