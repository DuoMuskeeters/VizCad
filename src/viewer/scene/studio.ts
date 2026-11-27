/**
 * The assembly side of the scene (docs/11 §4.2): the outline of a loaded model, and what the studio changes on it
 * without touching the file: visibility (local hide, isolate, a scene's hidden nodes), the selection highlight and a
 * scene's colours and finishes. Works on any tree whose objects carry `userData.vizcadPath` (the Worker's `buildModel`
 * and a GLB derivative alike). Materials it creates are its own and freed by `dispose`; the model's own ones are put
 * back first, so the model's dispose frees them as before.
 */
import { Box3, Color, type Material, type Mesh, MeshStandardMaterial, type Object3D, type Raycaster } from 'three'
import { chainOf, isUnder, type OutlineNode } from '../tree/outline'

export type Finish = 'matte' | 'satin' | 'metal'

/** A node's look from a scene record: hex colour and finish. Applies to everything under the node. */
export type NodeLook = { readonly color?: string | undefined; readonly finish?: Finish | undefined }

export type StudioView = {
  readonly selected: string | null
  /** "Open only this" (`?node=`): everything outside this subtree is hidden. */
  readonly isolated: string | null
  /** Hidden nodes: the person's own (B2, never saved) and the scene record's. */
  readonly hidden: ReadonlySet<string>
  readonly looks: ReadonlyMap<string, NodeLook>
}

export const EMPTY_VIEW: StudioView = { selected: null, isolated: null, hidden: new Set(), looks: new Map() }

/** Metalness and roughness per finish (docs/11 §0: colour + a matte/satin/metal preset, no material library). */
export const FINISHES: Record<Finish, { readonly metalness: number; readonly roughness: number }> = {
  matte: { metalness: 0, roughness: 0.85 },
  satin: { metalness: 0.1, roughness: 0.55 },
  metal: { metalness: 0.8, roughness: 0.3 },
}

/** The selection tint (brand cyan, docs/03 §5) added as emission, so a coloured part stays recognisable. */
const HIGHLIGHT = 0x22c3e0

export const pathOf = (object: Object3D): string | null => {
  const path: unknown = object.userData['vizcadPath']
  return typeof path === 'string' ? path : null
}

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true

const lastIndex = (path: string) => Number(path.slice(path.lastIndexOf('.') + 1))

/** Every object with a node path, by path. */
export const indexModel = (root: Object3D): Map<string, Object3D> => {
  const index = new Map<string, Object3D>()
  root.traverse((object) => {
    const path = pathOf(object)
    if (path !== null && !index.has(path)) index.set(path, object)
  })
  return index
}

const nameOf = (object: Object3D): string => {
  // GLTFLoader keeps the file's name in userData.name and a sanitised, de-duplicated one in `name`.
  const original: unknown = object.userData['name']
  return typeof original === 'string' ? original : object.name
}

/** The outline of the subtree at `top` (the `0` node). A node draws when it is a mesh or holds a mesh's primitives. */
export const outlineOf = (top: Object3D): OutlineNode => {
  const build = (object: Object3D, path: string): OutlineNode => {
    const kids = object.children.filter((child) => pathOf(child) !== null).sort((a, b) => lastIndex(pathOf(a)!) - lastIndex(pathOf(b)!))
    const children = kids.map((child) => build(child, pathOf(child)!))
    const drawn = isMesh(object) || object.children.some((child) => isMesh(child) && pathOf(child) === null)
    return { path, name: nameOf(object), drawn, parts: (drawn ? 1 : 0) + children.reduce((n, c) => n + c.parts, 0), children }
  }
  return build(top, pathOf(top) ?? '0')
}

type Look = { readonly color: string | null; readonly finish: Finish | null }

/** The nearest colour and the nearest finish on the way from `path` up to the root (each may come from another node). */
const lookAt = (path: string, looks: ReadonlyMap<string, NodeLook>): Look => {
  let color: string | null = null
  let finish: Finish | null = null
  const chain = chainOf(path)
  for (let i = chain.length - 1; i >= 0 && (color === null || finish === null); i--) {
    const look = looks.get(chain[i]!)
    if (look === undefined) continue
    if (color === null && look.color !== undefined) color = look.color
    if (finish === null && look.finish !== undefined) finish = look.finish
  }
  return { color, finish }
}

/** Visible under the rules of `view`: hidden nodes, and with an isolated node only its subtree and the way to it. */
export const visibleIn = (path: string, view: Pick<StudioView, 'isolated' | 'hidden'>) => {
  const iso = view.isolated
  if (iso !== null && !isUnder(path, iso)) return isUnder(iso, path)
  // The isolated node itself always draws: isolating a hidden node must not leave an empty canvas.
  return path === iso || !view.hidden.has(path)
}

export type Studio = {
  readonly outline: OutlineNode | null
  readonly objectAt: (path: string) => Object3D | null
  readonly apply: (view: StudioView) => void
  /** The part under the ray (a visible mesh), as the path of its node. */
  readonly pick: (raycaster: Raycaster) => string | null
  readonly boundsOf: (path: string) => Box3 | null
  /** The file's own colour of a node (its first mesh's material, before any look), `#rrggbb`. */
  readonly colorOf: (path: string) => string | null
  readonly dispose: () => void
}

export const createStudio = (model: Object3D): Studio => {
  const index = indexModel(model)
  const top = index.get('0')
  const outline = top === undefined ? null : outlineOf(top)
  // Every mesh and the node it draws for: its own path, or (a GLB primitive) the nearest ancestor's.
  const meshes = new Map<Mesh, string>()
  model.traverse((object) => {
    if (!isMesh(object)) return
    let at: Object3D | null = object
    while (at !== null && pathOf(at) === null) at = at.parent
    if (at !== null) meshes.set(object, pathOf(at)!)
  })
  const base = new Map<Mesh, Material | Material[]>()
  for (const mesh of meshes.keys()) base.set(mesh, mesh.material)
  const styled = new Map<string, MeshStandardMaterial>()
  const lit = new Map<Material, Material>()

  const styledFor = (look: Look, from: Material): MeshStandardMaterial => {
    const standard = from as Partial<MeshStandardMaterial>
    const color = look.color ?? `#${(standard.color ?? new Color(0xb8c4d0)).getHexString()}`
    const flat = standard.flatShading === true
    const vertexColors = look.color === null && standard.vertexColors === true
    const key = `${color}|${look.finish ?? '-'}|${flat}|${vertexColors}`
    let material = styled.get(key)
    if (material === undefined) {
      const finish = look.finish === null ? { metalness: standard.metalness ?? 0.1, roughness: standard.roughness ?? 0.6 } : FINISHES[look.finish]
      material = new MeshStandardMaterial({ color: new Color(color), ...finish, side: from.side, flatShading: flat, vertexColors })
      styled.set(key, material)
    }
    return material
  }
  const highlight = (material: Material): Material => {
    let out = lit.get(material)
    if (out === undefined) {
      out = material.clone()
      const emissive = out as Partial<MeshStandardMaterial>
      if (emissive.emissive instanceof Color) {
        emissive.emissive.setHex(HIGHLIGHT)
        emissive.emissiveIntensity = 0.45
      }
      lit.set(material, out)
    }
    return out
  }

  return {
    outline,
    objectAt: (path) => index.get(path) ?? null,
    apply: (view) => {
      for (const [path, object] of index) object.visible = visibleIn(path, view)
      for (const [mesh, path] of meshes) {
        const original = base.get(mesh)!
        const look = view.looks.size === 0 ? null : lookAt(path, view.looks)
        const first = Array.isArray(original) ? original[0] : original
        let material: Material | Material[] = look !== null && (look.color !== null || look.finish !== null) && first !== undefined ? styledFor(look, first) : original
        if (view.selected !== null && isUnder(path, view.selected)) material = Array.isArray(material) ? material.map(highlight) : highlight(material)
        mesh.material = material
      }
    },
    pick: (raycaster) => {
      // Only meshes that are drawn: hidden ones and the edge lines (children of meshes, not in `meshes`) are not tested.
      const shown: Mesh[] = []
      for (const mesh of meshes.keys()) {
        let visible = true
        for (let at: Object3D | null = mesh; at !== null && visible; at = at.parent) visible = at.visible
        if (visible) shown.push(mesh)
      }
      const hit = raycaster.intersectObjects(shown, false)[0]
      return hit === undefined ? null : (meshes.get(hit.object as Mesh) ?? null)
    },
    boundsOf: (path) => {
      const object = index.get(path)
      if (object === undefined) return null
      object.updateWorldMatrix(true, true)
      const box = new Box3().setFromObject(object)
      return box.isEmpty() ? null : box
    },
    colorOf: (path) => {
      for (const [mesh, at] of meshes) {
        if (!isUnder(at, path)) continue
        const original = base.get(mesh)
        const first = (Array.isArray(original) ? original[0] : original) as Partial<MeshStandardMaterial> | undefined
        if (first?.color instanceof Color) return `#${first.color.getHexString()}`
      }
      return null
    },
    dispose: () => {
      for (const [mesh, original] of base) mesh.material = original
      styled.forEach((m) => m.dispose())
      lit.forEach((m) => m.dispose())
      styled.clear()
      lit.clear()
    },
  }
}
