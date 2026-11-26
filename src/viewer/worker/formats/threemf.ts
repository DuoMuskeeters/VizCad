/**
 * 3MF without DOMParser (docs/11 §1.2): the ZIP is opened with fflate and the model parts are read with `xml.ts`.
 * Supported: core `object`/`mesh`/`vertices`/`triangles`/`components`/`build` with transforms, `basematerials` and the
 * materials extension's `colorgroup` (per-object and per-triangle colours), and the production extension's `path`
 * (objects in other model parts, as Bambu Studio and PrusaSlicer write them). Units are converted to millimetres.
 *
 * Hostile archives: only `_rels/.rels` and the model parts the build actually references are inflated, and the sizes
 * the ZIP declares for them are summed against `MAX_INFLATED_BYTES` before each one is inflated (fflate inflates into a
 * buffer of the declared size, so a lying header cannot grow past it). Component expansion counts nodes as it goes and
 * stops at `MAX_NODES`; colours are interned and capped.
 */
import { unzipSync, type UnzipFileInfo } from 'fflate'
import { MAX_NODES, ParseFailure, type FaceGroup, type MeshData, type ParsedModel, type Rgb } from '../protocol'
import { normaliseTree, type RawNode } from '../../tree/tree'
import { readXml, XmlError, type XmlAttributes } from './xml'

const ROOT_MODEL = '3D/3dmodel.model'
const RELS = '_rels/.rels'
const MODEL_RELATIONSHIP = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'
const MAX_DEPTH = 32
/** Sum of the declared uncompressed sizes of everything inflated from one archive. */
export const MAX_INFLATED_BYTES = 512 * 1024 * 1024
/** Palette entries (`base`, `color`) per model part; later ones read as "no colour". */
export const MAX_PALETTE_ENTRIES = 65_536
/** Distinct colours in one mesh; past it the mesh is drawn in its object colour (each colour is a draw call). */
export const MAX_MESH_COLORS = 256

const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }

type Mesh3mf = { readonly vertices: Float32Array; readonly triangles: Uint32Array; readonly colors: ReadonlyArray<Rgb | null> }
type Component = { readonly objectId: string; readonly path: string | null; readonly matrix: number[] | null }
type Object3mf = {
  readonly id: string
  readonly name: string
  readonly color: Rgb | null
  readonly mesh: Mesh3mf | null
  readonly components: ReadonlyArray<Component>
}
type Part = { readonly unit: number; readonly objects: ReadonlyMap<string, Object3mf>; readonly build: ReadonlyArray<Component> }

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** `#RRGGBB` or `#RRGGBBAA` → linear RGB; null for anything else. */
export const parseColor = (value: string | undefined): Rgb | null => {
  const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(value?.trim() ?? '')
  if (!match) return null
  const hex = match[1] ?? '000000'
  const channel = (i: number) => srgbToLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  return [channel(0), channel(2), channel(4)]
}

/** `m00 m01 m02 m10 … m32` (row-vector 4×3, 3MF §4.1.1) → column-major 4×4. */
export const parseTransform = (value: string | undefined): number[] | null => {
  if (value === undefined || value.trim() === '') return null
  const m = value.trim().split(/\s+/).map(Number)
  if (m.length !== 12 || m.some((v) => !Number.isFinite(v))) throw new ParseFailure('corrupt', 'bad 3MF transform')
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22, m30, m31, m32] = m as [number, number, number, number, number, number, number, number, number, number, number, number]
  return [m00, m01, m02, 0, m10, m11, m12, 0, m20, m21, m22, 0, m30, m31, m32, 1]
}

const normalisePath = (path: string) => path.replace(/^\/+/, '')

const number = (attributes: XmlAttributes, name: string) => {
  const value = Number(attributes[name])
  if (!Number.isFinite(value)) throw new ParseFailure('corrupt', `bad 3MF ${name}`)
  return value
}

const readPart = (xml: string): Part => {
  const objects = new Map<string, Object3mf>()
  // One Rgb object per distinct value, so meshes can group triangles by reference.
  const interned = new Map<string, Rgb | null>()
  const intern = (value: string | undefined): Rgb | null => {
    const key = value?.trim().toLowerCase() ?? ''
    let color = interned.get(key)
    if (color === undefined && !interned.has(key)) {
      color = parseColor(key)
      interned.set(key, color)
    }
    return color ?? null
  }
  let paletteEntries = 0
  const pushColor = (value: string | undefined) => {
    if (palette === null) return
    paletteEntries++
    palette.push(paletteEntries > MAX_PALETTE_ENTRIES ? null : intern(value))
  }
  const build: Component[] = []
  const palettes = new Map<string, Array<Rgb | null>>()
  let unit = 1
  let palette: Array<Rgb | null> | null = null
  let current: { id: string; name: string; pid: string | undefined; pindex: string | undefined; components: Component[] } | null = null
  let vertices: number[] = []
  let triangles: number[] = []
  let triangleColors: Array<Rgb | null> = []
  let hasMesh = false

  const colorOf = (pid: string | undefined, index: string | undefined): Rgb | null => {
    if (pid === undefined) return null
    const entries = palettes.get(pid)
    if (entries === undefined) return null
    return entries[Number(index ?? 0)] ?? null
  }

  try {
    readXml(xml, {
      open: (name, a) => {
        switch (name) {
          case 'model':
            if (a['unit'] !== undefined) unit = UNIT_MM[a['unit']] ?? 1
            break
          case 'basematerials':
          case 'colorgroup':
            palette = []
            if (a['id'] !== undefined) palettes.set(a['id'], palette)
            break
          case 'base':
            pushColor(a['displaycolor'])
            break
          case 'color':
            pushColor(a['color'])
            break
          case 'object':
            current = { id: a['id'] ?? '', name: a['name'] ?? '', pid: a['pid'], pindex: a['pindex'], components: [] }
            vertices = []
            triangles = []
            triangleColors = []
            hasMesh = false
            break
          case 'mesh':
            hasMesh = true
            break
          case 'vertex':
            vertices.push(number(a, 'x'), number(a, 'y'), number(a, 'z'))
            break
          case 'triangle': {
            triangles.push(number(a, 'v1'), number(a, 'v2'), number(a, 'v3'))
            const pid = a['pid'] ?? current?.pid
            const index = a['p1'] ?? (a['pid'] === undefined ? current?.pindex : undefined)
            triangleColors.push(colorOf(pid, index))
            break
          }
          case 'component':
            current?.components.push({ objectId: a['objectid'] ?? '', path: a['path'] ?? null, matrix: parseTransform(a['transform']) })
            break
          case 'item':
            build.push({ objectId: a['objectid'] ?? '', path: a['path'] ?? null, matrix: parseTransform(a['transform']) })
            break
        }
      },
      close: (name) => {
        if (name === 'basematerials' || name === 'colorgroup') palette = null
        if (name === 'object' && current !== null) {
          const count = vertices.length / 3
          if (triangles.some((v) => v < 0 || v >= count || !Number.isInteger(v))) throw new ParseFailure('corrupt', '3MF triangle index out of range')
          objects.set(current.id, {
            id: current.id,
            name: current.name,
            color: colorOf(current.pid, current.pindex),
            mesh: hasMesh ? { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), colors: triangleColors } : null,
            components: current.components,
          })
          current = null
        }
      },
    })
  } catch (error) {
    if (error instanceof XmlError) throw new ParseFailure('corrupt', error.message)
    throw error
  }
  return { unit, objects, build }
}

/**
 * Triangles reordered so equal colours are contiguous, one group per colour (none when the mesh has one colour). Colours
 * are interned per part, so a Map by reference groups equal values. Past `MAX_MESH_COLORS` the mesh takes its object colour.
 */
const meshData = (object: Object3mf, mesh: Mesh3mf): MeshData => {
  const count = mesh.triangles.length / 3
  const slot = new Map<Rgb | null, number>()
  const keys: Array<Rgb | null> = []
  const byKey: number[][] = []
  for (let t = 0; t < count && keys.length <= MAX_MESH_COLORS; t++) {
    const color = mesh.colors[t] ?? null
    let k = slot.get(color)
    if (k === undefined) {
      k = keys.length
      slot.set(color, k)
      keys.push(color)
      byKey.push([])
    }
    byKey[k]!.push(t)
  }
  if (keys.length > MAX_MESH_COLORS) {
    keys.length = 0
    byKey.length = 0
  }
  const uniform = keys.length <= 1
  const index = uniform ? mesh.triangles : new Uint32Array(mesh.triangles.length)
  const groups: FaceGroup[] = []
  if (!uniform) {
    let at = 0
    byKey.forEach((list, k) => {
      groups.push({ first: at, count: list.length, color: keys[k] ?? object.color })
      for (const t of list) {
        index[at * 3] = mesh.triangles[t * 3]!
        index[at * 3 + 1] = mesh.triangles[t * 3 + 1]!
        index[at * 3 + 2] = mesh.triangles[t * 3 + 2]!
        at++
      }
    })
  }
  return {
    name: object.name,
    color: uniform ? (keys[0] ?? object.color) : object.color,
    position: mesh.vertices,
    normal: null,
    index,
    vertexColor: null,
    groups,
  }
}

const relationshipTarget = (rels: Uint8Array | undefined) => {
  if (rels === undefined) return ROOT_MODEL
  let target: string | null = null
  readXml(new TextDecoder().decode(rels), {
    open: (name, a) => {
      if (name === 'Relationship' && a['Type'] === MODEL_RELATIONSHIP && a['Target'] !== undefined && target === null) target = normalisePath(a['Target'])
    },
  })
  return target ?? ROOT_MODEL
}

/** Inflates named entries only, refusing (`too_complex`) once the declared sizes of what was inflated pass the budget. */
const zipReader = (bytes: Uint8Array) => {
  let inflated = 0
  return (names: ReadonlySet<string>): Record<string, Uint8Array> => {
    const take = (file: UnzipFileInfo) => {
      if (!names.has(file.name)) return false
      inflated += file.originalSize
      if (inflated > MAX_INFLATED_BYTES) throw new ParseFailure('too_complex', '3MF expands past the budget')
      return true
    }
    try {
      return unzipSync(bytes, { filter: take })
    } catch (error) {
      if (error instanceof ParseFailure) throw error
      throw new ParseFailure('corrupt', 'not a ZIP archive')
    }
  }
}

/** Model parts a part points into (production extension `p:path`), besides itself. */
const referencedParts = (part: Part, self: string) => {
  const out = new Set<string>()
  const add = (ref: Component) => {
    if (ref.path !== null) out.add(normalisePath(ref.path))
  }
  part.build.forEach(add)
  for (const object of part.objects.values()) object.components.forEach(add)
  out.delete(self)
  return out
}

export const parse3mf = (buffer: ArrayBuffer, name: string): ParsedModel => {
  const read = zipReader(new Uint8Array(buffer))
  const decoder = new TextDecoder()
  const rootPath = relationshipTarget(read(new Set([RELS]))[RELS])

  // Breadth first from the root: each round inflates the parts the previous round referenced, in one pass over the ZIP.
  // A part is never tried twice; one that is missing fails only if the tree reaches it (`nodeOf`). No round past MAX_DEPTH.
  const parts = new Map<string, Part>()
  const tried = new Set<string>()
  let wanted = new Set([rootPath])
  for (let round = 0; wanted.size > 0 && round <= MAX_DEPTH; round++) {
    wanted.forEach((path) => tried.add(path))
    const files = read(wanted)
    const next = new Set<string>()
    for (const path of wanted) {
      const bytes = files[path]
      if (bytes === undefined) continue
      const part = readPart(decoder.decode(bytes))
      parts.set(path, part)
      for (const ref of referencedParts(part, path)) if (!tried.has(ref)) next.add(ref)
    }
    wanted = next
  }
  const partAt = (path: string): Part => {
    const part = parts.get(path)
    if (part === undefined) throw new ParseFailure('corrupt', `missing 3MF part ${path}`)
    return part
  }
  const root = partAt(rootPath)

  const meshes: MeshData[] = []
  const meshIndex = new Map<string, number>()
  // Counted while expanding: a component chain that doubles at every level would otherwise build 2^depth nodes first.
  let nodes = 0
  const nodeOf = (ref: Component, partPath: string, depth: number): RawNode => {
    if (depth > MAX_DEPTH) throw new ParseFailure('corrupt', '3MF components nest too deep')
    nodes++
    if (nodes > MAX_NODES) throw new ParseFailure('too_complex', '3MF expands to too many nodes')
    const path = ref.path === null ? partPath : normalisePath(ref.path)
    const part = partAt(path)
    const object = part.objects.get(ref.objectId)
    if (object === undefined) throw new ParseFailure('corrupt', `3MF object ${ref.objectId} missing`)
    const label = object.name || `Object ${object.id}`
    const children = object.components.map((component) => nodeOf(component, path, depth + 1))
    const key = `${path}#${object.id}`
    let mesh: number | undefined
    if (object.mesh !== null && object.mesh.triangles.length > 0) {
      mesh = meshIndex.get(key)
      if (mesh === undefined) {
        mesh = meshes.length
        meshes.push(meshData({ ...object, name: label }, object.mesh))
        meshIndex.set(key, mesh)
      }
    }
    return { name: label, meshes: mesh === undefined ? [] : [mesh], matrix: ref.matrix, children }
  }
  const items = root.build.map((item) => nodeOf(item, rootPath, 0))
  // Units apply to the whole model (vertices and transform translations alike): one scale on the root.
  const u = root.unit
  const matrix = u === 1 ? null : [u, 0, 0, 0, 0, u, 0, 0, 0, 0, u, 0, 0, 0, 0, 1]
  return { meshes, tree: normaliseTree({ name, meshes: [], matrix, children: items }, meshes), up: 'z' }
}
