/**
 * Scene records in the browser (docs/11 §3): reading a body into what the viewer applies, sparse edits, and matching
 * an earlier model's record to a new one by name path (§3.3). Pure, no three.js, no `effect`: the page (app chunk)
 * uses it and Vitest tests it.
 */
import { SCENE_MAX_NODES, SCENE_NAME_PATH_MAX, type SceneBody, type SceneFinish, type SceneNode } from '#/shared/scene'
import { findNode, namePaths, type OutlineNode } from './outline'

export type SceneLook = { readonly color?: string | undefined; readonly finish?: SceneFinish | undefined }

/** Colours and finishes by node path, for `StudioView.looks`. */
export const looksOf = (body: SceneBody): Map<string, SceneLook> => {
  const out = new Map<string, SceneLook>()
  for (const [path, node] of Object.entries(body.nodes))
    if (node.color !== undefined || node.finish !== undefined) out.set(path, { color: node.color, finish: node.finish })
  return out
}

/** Nodes the record hides for everyone. */
export const hiddenOf = (body: SceneBody): Set<string> => new Set(Object.entries(body.nodes).flatMap(([path, node]) => (node.hidden ? [path] : [])))

/** Shown names by node path. */
export const namesOf = (body: SceneBody): Map<string, string> =>
  new Map(Object.entries(body.nodes).flatMap(([path, node]) => (node.name !== undefined ? [[path, node.name] as const] : [])))

export type SceneEdit = {
  readonly name?: string | null
  readonly color?: string | null
  readonly finish?: SceneFinish | null
  readonly hidden?: boolean
}

/**
 * The body with one node changed. `null` (or `hidden: false`) removes a field; an entry left with nothing but its name
 * path is dropped, so the body stays sparse. `at` (the node's name path, §3.3) is written with every entry, unless it is
 * longer than the server takes (deep, long names): then the entry goes without it (it cannot be matched later), rather
 * than the whole body being refused.
 */
export const editNode = (body: SceneBody, path: string, edit: SceneEdit, at: string | undefined): SceneBody => {
  const current: SceneNode = body.nodes[path] ?? {}
  const pick = <K extends keyof SceneNode>(key: K, value: SceneNode[K] | null | undefined): Partial<SceneNode> =>
    value === undefined ? (current[key] === undefined ? {} : { [key]: current[key] }) : value === null ? {} : { [key]: value }
  const name = edit.name === undefined ? undefined : edit.name === null ? null : edit.name.trim() === '' ? null : edit.name.trim()
  const next: SceneNode = {
    ...pick('name', name),
    ...pick('color', edit.color === undefined || edit.color === null ? edit.color : edit.color.toLowerCase()),
    ...pick('finish', edit.finish),
    ...pick('hidden', edit.hidden === undefined ? undefined : edit.hidden ? true : null),
  }
  const nodes = { ...body.nodes }
  if (Object.keys(next).length === 0) delete nodes[path]
  else nodes[path] = at === undefined || at.length > SCENE_NAME_PATH_MAX ? next : { ...next, at }
  return { ...body, nodes }
}

export const nodeCount = (body: SceneBody) => Object.keys(body.nodes).length

export const fitsLimits = (body: SceneBody) => nodeCount(body) <= SCENE_MAX_NODES

export type Match = {
  readonly body: SceneBody
  /** Entries of the earlier record that found their node. */
  readonly matched: number
  /** Name paths that did not (a renamed, moved or removed part). */
  readonly unmatched: readonly string[]
}

/**
 * Carries an earlier model's record over to `outline` (§3.3): each entry finds the node with the same name path (written
 * with the entry as `at`); an entry without `at` is matched by its old path only if the node there has the same name
 * path in the new model, which it cannot know: it counts as unmatched. Saved views are not carried (their cameras and
 * paths belong to the old model).
 */
export const matchPrevious = (previous: SceneBody, outline: OutlineNode): Match => {
  const byName = new Map<string, string>()
  for (const [path, name] of namePaths(outline)) byName.set(name, path)
  const nodes: Record<string, SceneNode> = {}
  const unmatched: string[] = []
  let matched = 0
  for (const [oldPath, entry] of Object.entries(previous.nodes)) {
    const at = entry.at
    const path = at === undefined ? undefined : byName.get(at)
    if (path === undefined || findNode(outline, path) === null) {
      unmatched.push(at ?? oldPath)
      continue
    }
    nodes[path] = entry
    matched++
  }
  return { body: { v: 1, nodes, views: [] }, matched, unmatched }
}
