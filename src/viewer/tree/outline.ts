/**
 * The assembly outline (docs/11 §4): the model tree as plain data for the tree panel, the folder view and the path bar.
 * No three.js and no React: the viewer chunk builds it once per model, the page (app chunk) reads it. Node paths follow
 * docs/11 §1.3 (`0.3.2`).
 */

export type OutlineNode = {
  readonly path: string
  /** The name in the file (a scene record may show another one, docs/11 §3). */
  readonly name: string
  /** Drawn parts at or under this node (an assembly's "86 parts"). */
  readonly parts: number
  /** This node draws geometry itself: a part. */
  readonly drawn: boolean
  readonly children: ReadonlyArray<OutlineNode>
}

export const ROOT = '0'

const PATH = /^0(\.(0|[1-9]\d{0,5}))*$/

/** A path as the URL may carry it (`?node=`): `0`, `0.3.2`; at most 64 levels. */
export const isNodePath = (value: unknown): value is string => typeof value === 'string' && value.length <= 448 && PATH.test(value)

/** `path` is `ancestor` or lies under it. */
export const isUnder = (path: string, ancestor: string) => path === ancestor || path.startsWith(`${ancestor}.`)

/** `0.3.2` → `['0', '0.3', '0.3.2']`. */
export const chainOf = (path: string): string[] => {
  const steps = path.split('.')
  return steps.map((_, i) => steps.slice(0, i + 1).join('.'))
}

export const parentOf = (path: string): string | null => {
  const at = path.lastIndexOf('.')
  return at < 0 ? null : path.slice(0, at)
}

/** An assembly opens like a folder: a node with children. A drawn node with children is still an assembly. */
export const isAssembly = (node: OutlineNode) => node.children.length > 0

/** The node at `path`, or null (a stale `?node=` after a new version). */
export const findNode = (root: OutlineNode, path: string): OutlineNode | null => {
  if (!isNodePath(path)) return null
  let node: OutlineNode = root
  if (node.path !== ROOT) return null
  for (const step of path.split('.').slice(1)) {
    const next: OutlineNode | undefined = node.children[Number(step)]
    if (next === undefined) return null
    node = next
  }
  return node
}

/**
 * Where an assembly really starts: from the root down while a level holds a single sub-assembly and nothing else
 * (CAD exports often wrap everything in one or two nodes). The folder view opens there and the tree expands to it.
 */
export const soleChain = (root: OutlineNode): OutlineNode => {
  let node = root
  for (;;) {
    const only = node.children.length === 1 ? node.children[0] : undefined
    if (only === undefined || !isAssembly(only)) return node
    node = only
  }
}

/**
 * The level a folder view or the phone list opens for `path`: the node itself when it has children, its parent for a
 * part (a part has no level of its own: shown empty, the view would look broken), the sole-chain start when the path
 * is missing.
 */
export const levelOf = (root: OutlineNode, path: string | null): string => {
  const node = path === null ? null : findNode(root, path)
  if (node === null) return soleChain(root).path
  if (isAssembly(node)) return node.path
  return parentOf(node.path) ?? node.path
}

export const countNodes = (root: OutlineNode): number => {
  let n = 0
  const walk = (node: OutlineNode) => {
    n++
    node.children.forEach(walk)
  }
  walk(root)
  return n
}

/** Deepest level under the root (root alone is 0) and the number of assemblies under it. */
export const outlineShape = (root: OutlineNode): { readonly depth: number; readonly assemblies: number } => {
  let depth = 0
  let assemblies = 0
  const walk = (node: OutlineNode, level: number) => {
    if (level > depth) depth = level
    if (level > 0 && isAssembly(node)) assemblies++
    for (const child of node.children) walk(child, level + 1)
  }
  walk(root, 0)
  return { depth, assemblies }
}

export type NameOf = (node: OutlineNode) => string

export const fileName: NameOf = (node) => node.name

export type TreeRow = {
  readonly node: OutlineNode
  readonly depth: number
  readonly expanded: boolean
}

/** Rows of the tree panel: the root and every child of an expanded node, depth first. */
export const visibleRows = (root: OutlineNode, expanded: ReadonlySet<string>): TreeRow[] => {
  const rows: TreeRow[] = []
  const walk = (node: OutlineNode, depth: number) => {
    const open = expanded.has(node.path) && isAssembly(node)
    rows.push({ node, depth, expanded: open })
    if (open) for (const child of node.children) walk(child, depth + 1)
  }
  walk(root, 0)
  return rows
}

/** Turkish letters without a decomposition (`ı`) and with one map to their base letter, so `ısı` finds `Isı` and `cark` finds `Çark`. */
const TURKISH: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u' }

/** Case and accent folded, independent of the runtime's locale (`toLocaleLowerCase` in tr maps `I` to `ı`). */
export const fold = (text: string) =>
  text.toLowerCase().replace(/[ışğçöü]/g, (c) => TURKISH[c] ?? c).normalize('NFKD').replace(/\p{M}/gu, '')

export type SearchHit = { readonly node: OutlineNode; readonly parentPath: string | null }

/**
 * Nodes whose shown name contains every word of `query` (case and accent folded), depth first, at most `limit`.
 * `scope` limits the search to one subtree (the folder view searches its own level and below).
 */
export const searchOutline = (root: OutlineNode, query: string, nameOf: NameOf = fileName, limit = 200, scope?: OutlineNode): { readonly hits: SearchHit[]; readonly more: boolean } => {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const hits: SearchHit[] = []
  let more = false
  if (words.length === 0) return { hits, more }
  const start = scope ?? root
  const walk = (node: OutlineNode, parent: string | null) => {
    if (more) return
    if (node !== start) {
      const name = fold(nameOf(node))
      if (words.every((w) => name.includes(w))) {
        if (hits.length === limit) {
          more = true
          return
        }
        hits.push({ node, parentPath: parent })
      }
    }
    for (const child of node.children) walk(child, node.path)
  }
  walk(start, parentOf(start.path))
  return { hits, more }
}

/**
 * The name path of every node (docs/11 §3.3): names from the root down, with `[n]` (1-based) when siblings share a
 * name, e.g. `Pump/Body/Screw M3 [2]`. Stable across versions where indexes are not: the key that matches a scene
 * record to a new version.
 */
export const namePaths = (root: OutlineNode): Map<string, string> => {
  // A `/` inside a name must not read as a level: escaped, like the backslash itself.
  const esc = (name: string) => name.replace(/[\\/]/g, (c) => `\\${c}`)
  const out = new Map<string, string>()
  const walk = (node: OutlineNode, prefix: string) => {
    out.set(node.path, prefix)
    const seen = new Map<string, number>()
    const totals = new Map<string, number>()
    for (const child of node.children) totals.set(child.name, (totals.get(child.name) ?? 0) + 1)
    for (const child of node.children) {
      const n = (seen.get(child.name) ?? 0) + 1
      seen.set(child.name, n)
      const own = (totals.get(child.name) ?? 0) > 1 ? `${esc(child.name)} [${n}]` : esc(child.name)
      walk(child, `${prefix}/${own}`)
    }
  }
  walk(root, esc(root.name))
  return out
}
