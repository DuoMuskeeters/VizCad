// @vitest-environment jsdom
/**
 * The GLB writer in Node (docs/11 §7, the `bench/viewer/node-convert.cjs` pattern): real STEP/IGES/3MF through the same
 * readers as the Worker, `buildModel`, `exportGlb`, then back through GLTFLoader (`loadGlb`). The tree and every
 * `vizcadPath` survive the round trip, the Y-up root is explicit, and the server's header check accepts the bytes.
 * Samples outside the repo (`VIZCAD_SAMPLES`, e.g. ~/Desktop/vizcad-test-dosyalari) are converted too when set.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Box3, type Mesh, type Object3D } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { glbHeaderProblem } from '#/server/glb'
import { allPaths } from '../tree/tree'
import { parseSource } from '../worker/formats'
import type { Occt } from '../worker/formats/step'
import { formatOfExtension, type ParsedModel, type TreeNode } from '../worker/protocol'
import { buildModel } from './build'
import { exportGlb, GLB_ROOT_NAME } from './glb'
import { loadGlb } from './loadGlb'

const require = createRequire(import.meta.url)
let occt: Occt
beforeAll(async () => {
  occt = await (require('occt-import-js') as () => Promise<Occt>)()
}, 60_000)

const occtFiles = 'node_modules/occt-import-js/test/testfiles'
const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

/** Paths of the nodes that draw something, and of all nodes, from the parsed tree. */
const drawnPaths = (model: ParsedModel) => {
  const out: string[] = []
  const walk = (node: TreeNode) => {
    if (node.mesh !== null && node.children.length === 0) out.push(node.path)
    node.children.forEach(walk)
  }
  walk(model.tree)
  return out.sort()
}

const pathsIn = (root: Object3D) => {
  const all: string[] = []
  const drawn: string[] = []
  root.traverse((object) => {
    const path = object.userData['vizcadPath']
    if (typeof path !== 'string') return
    all.push(path)
    if ((object as Mesh).isMesh || object.children.some((c) => (c as Mesh).isMesh && typeof c.userData['vizcadPath'] !== 'string')) drawn.push(path)
  })
  return { all: all.sort(), drawn: drawn.sort() }
}

const roundTrip = async (format: Parameters<typeof parseSource>[0], bytes: ArrayBuffer, name: string) => {
  const { model, stats } = await parseSource(format, bytes, name, { loadOcct: async () => occt })
  const root = buildModel(model)
  const before = new Box3().setFromObject(root)
  const glb = await exportGlb(root)
  // exportGlb leaves the tree where it was: the Worker still renders the thumbnail from it.
  expect(root.parent).toBeNull()
  expect(new Box3().setFromObject(root).min.toArray()).toEqual(before.min.toArray())
  const loaded = await loadGlb(glb)
  return { model, stats, glb, loaded, before }
}

const close = (a: ReadonlyArray<number>, b: ReadonlyArray<number>, tolerance: number) => a.every((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) <= tolerance)

describe('exportGlb → loadGlb', () => {
  it('CAx-IF AS1 STEP assembly: every node path, the drawn parts, triangles and the Z-up world survive', async () => {
    const { model, stats, glb, loaded, before } = await roundTrip('step', bufferOf(readFileSync(`${occtFiles}/cax-if/as1-oc-214.stp`)), 'as1.stp')
    expect(glbHeaderProblem(new Uint8Array(glb, 0, 20), glb.byteLength)).toBeUndefined()
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, new DataView(glb).getUint32(12, true)))) as {
      asset: { version: string }; scenes: Array<{ nodes: number[] }>; nodes: Array<{ name?: string; matrix?: number[]; rotation?: number[]; extras?: Record<string, unknown> }>
    }
    expect(json.asset.version).toBe('2.0')
    // The Y-up conversion is one explicit node at the top: -90° about X.
    const top = json.nodes[json.scenes[0]!.nodes[0]!]!
    expect(top.name).toBe(GLB_ROOT_NAME)
    expect(top.extras).toEqual({ vizcadUp: 'z' })
    const m = top.matrix ?? []
    expect(close(m, [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1], 1e-6)).toBe(true)

    const paths = pathsIn(loaded.root)
    expect(paths.all).toEqual([...allPaths(model.tree)].sort())
    expect(paths.drawn).toEqual(drawnPaths(model))
    expect(loaded.stats.triangles).toBe(stats.triangles)
    expect(loaded.stats.parts).toBe(stats.parts)
    expect(loaded.stats.nodes).toBe(stats.nodes)
    // Same place in the viewer's Z-up world as the model drawn from the source (float32 positions: µm tolerance).
    const after = new Box3().setFromObject(loaded.root)
    expect(close(after.min.toArray(), before.min.toArray(), 1e-3)).toBe(true)
    expect(close(after.max.toArray(), before.max.toArray(), 1e-3)).toBe(true)
    // Names and colours are kept.
    const names = new Set<string>()
    loaded.root.traverse((o) => void (typeof o.userData['vizcadPath'] === 'string' && names.add(o.name)))
    expect([...names].some((n) => /nut|rod|plate|bolt|l-bracket/i.test(n))).toBe(true)
  }, 60_000)

  it('IGES cube and a 3MF with components', async () => {
    const iges = await roundTrip('iges', bufferOf(readFileSync(`${occtFiles}/cube-10x10mm/Cube 10x10.igs`)), 'cube.igs')
    expect(iges.loaded.stats.triangles).toBe(iges.stats.triangles)
    expect(pathsIn(iges.loaded.root).all).toEqual([...allPaths(iges.model.tree)].sort())

    const { zipSync, strToU8 } = await import('fflate')
    const part = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>
      <object id="1" name="leg" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/></vertices>
      <triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="2" v3="3"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object>
      <object id="2" name="pair" type="model"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/></components></object>
      </resources><build><item objectid="2"/></build></model>`
    const archive = zipSync({ '3D/3dmodel.model': strToU8(part) })
    const threemf = await roundTrip('3mf', bufferOf(archive), 'pair.3mf')
    expect(threemf.loaded.stats.triangles).toBe(8)
    expect(threemf.loaded.stats.parts).toBe(threemf.stats.parts)
    expect(pathsIn(threemf.loaded.root).all).toEqual([...allPaths(threemf.model.tree)].sort())
    // A shared mesh (instancing) is written once.
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(threemf.glb, 20, new DataView(threemf.glb).getUint32(12, true)))) as { meshes: unknown[] }
    expect(json.meshes).toHaveLength(1)
  }, 60_000)

  it('refuses GLB bytes that are not a model', async () => {
    await expect(loadGlb(new TextEncoder().encode('not a glb at all').buffer)).rejects.toMatchObject({ code: 'corrupt' })
  })
})

const samples = process.env['VIZCAD_SAMPLES']
describe.skipIf(samples === undefined || !existsSync(samples))('bench samples (VIZCAD_SAMPLES)', () => {
  const files = samples === undefined || !existsSync(samples) ? [] : readdirSync(samples).filter((f) => ['step', 'iges', '3mf'].includes(formatOfExtension(f.split('.').pop() ?? '') ?? ''))
  it.each(files)('%s converts and round-trips', async (fileName) => {
    const path = join(samples ?? '', fileName)
    const format = formatOfExtension(fileName.split('.').pop() ?? '')!
    const started = performance.now()
    const { model, stats, glb, loaded } = await roundTrip(format, bufferOf(readFileSync(path)), fileName)
    expect(pathsIn(loaded.root).all).toEqual([...allPaths(model.tree)].sort())
    expect(loaded.stats.triangles).toBe(stats.triangles)
    console.log(JSON.stringify({ file: fileName, sourceMB: +(statSync(path).size / 1e6).toFixed(1), glbMB: +(glb.byteLength / 1e6).toFixed(1), nodes: stats.nodes, parts: stats.parts, triangles: stats.triangles, ms: Math.round(performance.now() - started) }))
  }, 600_000)
})
