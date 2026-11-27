/** Shown names and counts of assembly nodes (plain functions; the tree, folder view and panel share them). */
import { chainOf, findNode, type OutlineNode } from '#/viewer/tree/outline'

export type Namer = (node: OutlineNode) => string

/**
 * A node's shown name: a scene record's name first (5c-2), the file's name, the file name for an unnamed root, else
 * the "unnamed part" text.
 */
export const makeNamer = (fileBase: string, unnamed: string, renamed?: ReadonlyMap<string, string>): Namer => (node) =>
  renamed?.get(node.path) || node.name || (node.path === '0' ? fileBase : unnamed)

/** `Pump › Motor › Fan` from the root to `path`; the nodes that do not exist (a stale path) are left out. */
export const pathNames = (root: OutlineNode, path: string, nameOf: Namer): { readonly path: string; readonly name: string }[] =>
  chainOf(path).flatMap((at) => {
    const node = findNode(root, at)
    return node === null ? [] : [{ path: at, name: nameOf(node) }]
  })

/** Drawn parts hidden by `hidden` (a hidden assembly counts all of its parts once). */
export const hiddenParts = (root: OutlineNode, hidden: ReadonlySet<string>): number => {
  if (hidden.size === 0) return 0
  let n = 0
  const walk = (node: OutlineNode) => {
    if (hidden.has(node.path)) {
      n += node.parts
      return
    }
    node.children.forEach(walk)
  }
  walk(root)
  return n
}

export const baseName = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** `420 × 248 × 372 mm`, rounded to what a person reads (3 significant digits, at least whole tenths below 10). */
export const formatSize = (size: readonly [number, number, number], locale: string) => {
  const one = (v: number) => {
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
    return v.toLocaleString(locale, { maximumFractionDigits: digits })
  }
  return `${size.map(one).join(' × ')} mm`
}
