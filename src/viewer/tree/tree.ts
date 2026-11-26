/**
 * The model tree (docs/11 §1.3): node paths, normalisation of format trees and model statistics. Pure functions, no
 * three.js: the Worker, the main thread and Node tests share them.
 */
import { MAX_NODES, MAX_TRIANGLES, ParseFailure, type Bounds, type MeshData, type ParsedModel, type Stats, type TreeNode } from '../worker/protocol'

/** A tree as a format reader produces it: a node may list several meshes. */
export type RawNode = {
  readonly name: string
  readonly meshes: ReadonlyArray<number>
  readonly matrix?: ReadonlyArray<number> | null
  readonly children: ReadonlyArray<RawNode>
}

export const ROOT_PATH = '0'

export const childPath = (parent: string, index: number) => `${parent}.${index}`

/** `0.3.2` → [0, 3, 2]; null for anything that is not a path. */
export const parsePath = (path: string): number[] | null => {
  if (!/^0(\.(0|[1-9]\d{0,5}))*$/.test(path)) return null
  return path.split('.').map(Number)
}

/** The node at `path`, or null. */
export const nodeAt = (root: TreeNode, path: string): TreeNode | null => {
  const steps = parsePath(path)
  if (steps === null) return null
  let node: TreeNode | undefined = root
  for (const step of steps.slice(1)) {
    node = node.children[step]
    if (node === undefined) return null
  }
  return node
}

const meshName = (meshes: ReadonlyArray<MeshData>, index: number, fallback: string) => meshes[index]?.name || fallback

/**
 * Gives every node a path and at most one mesh. A node with exactly one mesh and no children carries it; otherwise its
 * child nodes come first and each mesh becomes a leaf after them, in the reader's order. Same input, same paths.
 */
export const normaliseTree = (raw: RawNode, meshes: ReadonlyArray<MeshData>, path = ROOT_PATH): TreeNode => {
  const matrix = raw.matrix ?? null
  const only = raw.meshes[0]
  if (raw.children.length === 0 && raw.meshes.length === 1 && only !== undefined)
    return { name: raw.name || meshName(meshes, only, ''), path, mesh: only, matrix, children: [] }
  const children: TreeNode[] = raw.children.map((child, i) => normaliseTree(child, meshes, childPath(path, i)))
  raw.meshes.forEach((mesh, i) => {
    const at = childPath(path, raw.children.length + i)
    children.push({ name: meshName(meshes, mesh, raw.name), path: at, mesh, matrix: null, children: [] })
  })
  return { name: raw.name, path, mesh: null, matrix, children }
}

export const triangleCount = (mesh: MeshData) => (mesh.index === null ? mesh.position.length / 9 : mesh.index.length / 3)

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Column-major 4×4 product a·b. */
export const multiply = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] => {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0)
      out[col * 4 + row] = sum
    }
  return out
}

const meshBounds = (mesh: MeshData): Bounds | null => {
  const p = mesh.position
  if (p.length < 3) return null
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = p[i + k] ?? 0
      if (v < min[k]!) min[k] = v
      if (v > max[k]!) max[k] = v
    }
  return { min, max }
}

/** Triangles, nodes, parts and the world bounding box (transforms applied). Throws `empty` / `too_large` per D22. */
export const modelStats = (model: Pick<ParsedModel, 'meshes' | 'tree'>, ms: number): Stats => {
  const boxes = model.meshes.map(meshBounds)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let triangles = 0
  let nodes = 0
  let parts = 0
  const walk = (node: TreeNode, parent: ReadonlyArray<number>) => {
    nodes++
    if (nodes > MAX_NODES) throw new ParseFailure('too_large', 'too many nodes')
    const world = node.matrix === null ? parent : multiply(parent, node.matrix)
    if (node.mesh !== null) {
      const mesh = model.meshes[node.mesh]
      const box = boxes[node.mesh]
      if (mesh !== undefined) {
        const count = triangleCount(mesh)
        triangles += count
        if (count > 0) parts++
      }
      if (box) {
        for (let corner = 0; corner < 8; corner++) {
          const x = corner & 1 ? box.max[0] : box.min[0]
          const y = corner & 2 ? box.max[1] : box.min[1]
          const z = corner & 4 ? box.max[2] : box.min[2]
          const point = [0, 1, 2].map((r) => (world[r] ?? 0) * x + (world[4 + r] ?? 0) * y + (world[8 + r] ?? 0) * z + (world[12 + r] ?? 0))
          for (let k = 0; k < 3; k++) {
            const v = point[k] ?? 0
            if (v < min[k]!) min[k] = v
            if (v > max[k]!) max[k] = v
          }
        }
      }
    }
    for (const child of node.children) walk(child, world)
  }
  walk(model.tree, identity)
  if (triangles > MAX_TRIANGLES) throw new ParseFailure('too_large', 'too many triangles')
  // D22: a conversion that yields no triangle is a failure (the 179 MB STEP returned success with zero triangles).
  if (triangles === 0 || !Number.isFinite(min[0])) throw new ParseFailure('empty')
  return { triangles, nodes, parts, bbox: { min, max }, ms: Math.round(ms) }
}

/** Every path in depth-first order (tests and the 5c tree panel). */
export const allPaths = (root: TreeNode): string[] => {
  const out: string[] = []
  const walk = (node: TreeNode) => {
    out.push(node.path)
    node.children.forEach(walk)
  }
  walk(root)
  return out
}
