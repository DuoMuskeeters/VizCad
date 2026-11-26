import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { zipSync, strToU8 } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { allPaths, nodeAt } from '../../tree/tree'
import { MAX_CONVERT_BYTES, ParseFailure, type ErrorCode } from '../protocol'
import { parseSource } from './index'
import type { Occt } from './step'

const require = createRequire(import.meta.url)
const occtFiles = 'node_modules/occt-import-js/test/testfiles'
let occt: Occt
beforeAll(async () => {
  const factory = require('occt-import-js') as () => Promise<Occt>
  occt = await factory()
}, 60_000)
const deps = { loadOcct: async () => occt }

const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
const text = (value: string) => bufferOf(new TextEncoder().encode(value))
const file = (path: string) => bufferOf(readFileSync(path))

const failure = async (promise: Promise<unknown>): Promise<ErrorCode> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof ParseFailure) return error.code
    throw error
  }
  throw new Error('expected a ParseFailure')
}

/** Binary STL of `count` triangles in the z = 0 plane. */
const binaryStl = (count: number) => {
  const bytes = new Uint8Array(84 + count * 50)
  const view = new DataView(bytes.buffer)
  view.setUint32(80, count, true)
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12
    const corners = [0, 0, 0, 10, 0, 0, 0, 10, 0].map((v, i) => (i % 3 === 0 ? v + t * 20 : v))
    corners.forEach((v, k) => view.setFloat32(at + k * 4, v, true))
  }
  return bufferOf(bytes)
}

describe('STL', () => {
  it('reads binary STL with flat normals', async () => {
    const { model, stats } = await parseSource('stl', binaryStl(2), 'plate.stl', deps)
    expect(stats.triangles).toBe(2)
    expect(stats.parts).toBe(1)
    expect(stats.bbox).toEqual({ min: [0, 0, 0], max: [30, 10, 0] })
    expect(Array.from(model.meshes[0]!.normal!.slice(0, 3))).toEqual([0, 0, 1])
    expect(model.tree).toMatchObject({ name: 'plate.stl', path: '0', mesh: 0, children: [] })
  })

  it('reads ASCII STL', async () => {
    const ascii = 'solid t\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n'
    const { stats } = await parseSource('stl', text(ascii), 't.stl', deps)
    expect(stats.triangles).toBe(1)
  })

  it('treats zero triangles as empty, not as success (D22)', async () => {
    expect(await failure(parseSource('stl', binaryStl(0), 'none.stl', deps))).toBe('empty')
    expect(await failure(parseSource('stl', new ArrayBuffer(0), 'zero.stl', deps))).toBe('empty')
  })

  it('drops triangles with a non-finite corner; none left is empty, never a blank model', async () => {
    const stl = binaryStl(3)
    const view = new DataView(stl)
    view.setFloat32(84 + 50 + 12, Number.NaN, true)
    view.setFloat32(84 + 100 + 12 + 4, Number.POSITIVE_INFINITY, true)
    const { stats } = await parseSource('stl', stl, 'nan.stl', deps)
    expect(stats.triangles).toBe(1)
    expect(stats.bbox).toEqual({ min: [0, 0, 0], max: [10, 10, 0] })
    const all = binaryStl(1)
    new DataView(all).setFloat32(84 + 12, Number.NaN, true)
    expect(await failure(parseSource('stl', all, 'all-nan.stl', deps))).toBe('empty')
    const ascii = 'solid t\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1e 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n'
    expect(await failure(parseSource('stl', text(ascii), 'garbled.stl', deps))).toBe('empty')
  })

  it('a model in one point draws nothing: empty', async () => {
    const point = bufferOf(new Uint8Array(84 + 50))
    new DataView(point).setUint32(80, 1, true)
    expect(await failure(parseSource('stl', point, 'point.stl', deps))).toBe('empty')
  })

  it('rejects a truncated binary STL', async () => {
    const cut = binaryStl(3).slice(0, 84 + 60)
    // The header announces 3 triangles but only one fits: not "binary" by size, NUL bytes keep it from the ASCII path.
    expect(await failure(parseSource('stl', cut, 'cut.stl', deps))).toBe('corrupt')
  })
})

describe('OBJ', () => {
  const obj = ['o Base', 'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4', 'o Pin', 'v 0 0 1', 'v 1 0 1', 'v 0 1 1', 'f 5 6 7', ''].join('\n')

  it('reads objects as parts, Y-up', async () => {
    const { model, stats } = await parseSource('obj', text(obj), 'two.obj', deps)
    expect(model.up).toBe('y')
    expect(stats.triangles).toBe(3)
    expect(stats.parts).toBe(2)
    expect(model.tree.children.map((n) => [n.path, n.name])).toEqual([['0.0', 'Base'], ['0.1', 'Pin']])
  })

  it('drops faces that point past the vertices', async () => {
    const { stats } = await parseSource('obj', text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 2 9\n'), 'bad.obj', deps)
    expect(stats.triangles).toBe(1)
    expect(stats.bbox).toEqual({ min: [0, 0, 0], max: [1, 1, 0] })
  })

  it('an OBJ with only points is empty', async () => {
    expect(await failure(parseSource('obj', text('v 0 0 0\nv 1 0 0\np 1 2\n'), 'p.obj', deps))).toBe('empty')
  })
})

describe('PLY', () => {
  const ascii = ['ply', 'format ascii 1.0', 'element vertex 4', 'property float x', 'property float y', 'property float z', 'property uchar red', 'property uchar green', 'property uchar blue', 'element face 2', 'property list uchar int vertex_indices', 'end_header', '0 0 0 255 0 0', '2 0 0 255 0 0', '2 2 0 255 0 0', '0 2 0 255 0 0', '3 0 1 2', '3 0 2 3', ''].join('\n')

  it('reads ASCII PLY with vertex colours', async () => {
    const { model, stats } = await parseSource('ply', text(ascii), 'sq.ply', deps)
    expect(stats.triangles).toBe(2)
    expect(model.meshes[0]!.index).not.toBeNull()
    expect(model.meshes[0]!.vertexColor?.[0]).toBeCloseTo(1)
    expect(model.meshes[0]!.normal).not.toBeNull()
  })

  it('reads binary little-endian PLY', async () => {
    const header = new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n')
    const body = new DataView(new ArrayBuffer(36 + 13))
    ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => body.setFloat32(i * 4, v, true))
    body.setUint8(36, 3)
    ;[0, 1, 2].forEach((v, i) => body.setInt32(37 + i * 4, v, true))
    const bytes = new Uint8Array(header.length + body.byteLength)
    bytes.set(header)
    bytes.set(new Uint8Array(body.buffer), header.length)
    const { stats } = await parseSource('ply', bufferOf(bytes), 'tri.ply', deps)
    expect(stats.triangles).toBe(1)
  })

  it('reads faces with their own colours (PLYLoader answers with unindexed geometry)', async () => {
    const faceColors = ['ply', 'format ascii 1.0', 'element vertex 4', 'property float x', 'property float y', 'property float z', 'element face 2', 'property list uchar int vertex_indices', 'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', '0 0 0', '2 0 0', '2 2 0', '0 2 0', '3 0 1 2 255 0 0', '3 0 2 3 0 0 255', ''].join('\n')
    const { model, stats } = await parseSource('ply', text(faceColors), 'faces.ply', deps)
    expect(stats.triangles).toBe(2)
    const mesh = model.meshes[0]!
    expect(mesh.index).toBeNull()
    expect(mesh.position.length).toBe(18)
    expect(mesh.vertexColor?.length).toBe(18)
    expect(mesh.normal?.length).toBe(18)
  })

  it('drops faces with indices past the vertices; normals stay finite', async () => {
    const bad = ['ply', 'format ascii 1.0', 'element vertex 3', 'property float x', 'property float y', 'property float z', 'element face 2', 'property list uchar int vertex_indices', 'end_header', '0 0 0', '1 0 0', '0 1 0', '3 0 1 2', '3 0 1 7', ''].join('\n')
    const { model, stats } = await parseSource('ply', text(bad), 'bad.ply', deps)
    expect(stats.triangles).toBe(1)
    expect(Array.from(model.meshes[0]!.normal!).every(Number.isFinite)).toBe(true)
  })

  it('reads the face count from the header: none or zero is empty', async () => {
    const zero = ['ply', 'format ascii 1.0', 'element vertex 3', 'property float x', 'property float y', 'property float z', 'element face 0', 'property list uchar int vertex_indices', 'end_header', '0 0 0', '1 0 0', '0 1 0', ''].join('\n')
    expect(await failure(parseSource('ply', text(zero), 'zero.ply', deps))).toBe('empty')
    expect(await failure(parseSource('ply', text('ply\nformat ascii 1.0\nelement vertex 1\n'), 'cut.ply', deps))).toBe('corrupt')
  })

  it('a point cloud is empty', async () => {
    const cloud = ['ply', 'format ascii 1.0', 'element vertex 2', 'property float x', 'property float y', 'property float z', 'end_header', '0 0 0', '1 1 1', ''].join('\n')
    expect(await failure(parseSource('ply', text(cloud), 'cloud.ply', deps))).toBe('empty')
  })

  it('garbage is corrupt', async () => {
    expect(await failure(parseSource('ply', text('hello'), 'x.ply', deps))).toBe('corrupt')
  })
})

describe('STEP and IGES (occt-import-js in Node)', () => {
  it('keeps the CAx-IF AS1 assembly tree, names and colours', async () => {
    const { model, stats } = await parseSource('step', file(`${occtFiles}/cax-if/as1-oc-214.stp`), 'as1.stp', deps)
    expect(stats.parts).toBe(18)
    expect(stats.triangles).toBeGreaterThan(1000)
    expect(model.meshes.some((mesh) => mesh.color !== null)).toBe(true)
    const paths = allPaths(model.tree)
    expect(paths[0]).toBe('0')
    expect(new Set(paths).size).toBe(paths.length)
    // Every path addresses its own node, and every mesh-carrying node is a leaf.
    for (const path of paths) expect(nodeAt(model.tree, path)?.path).toBe(path)
    const leaves = paths.map((path) => nodeAt(model.tree, path)!).filter((node) => node.mesh !== null)
    expect(leaves.every((node) => node.children.length === 0)).toBe(true)
    expect(leaves.length).toBe(stats.parts)
    // Groups, when present, cover every triangle exactly once.
    for (const mesh of model.meshes)
      if (mesh.groups.length > 0) expect(mesh.groups.reduce((sum, g) => sum + g.count, 0)).toBe(mesh.index!.length / 3)
  }, 60_000)

  it('gives the same paths on a second conversion', async () => {
    const a = await parseSource('step', file(`${occtFiles}/cax-if/as1-oc-214.stp`), 'as1.stp', deps)
    const b = await parseSource('step', file(`${occtFiles}/cax-if/as1-oc-214.stp`), 'as1.stp', deps)
    const names = (m: typeof a) => allPaths(m.model.tree).map((path) => `${path}:${nodeAt(m.model.tree, path)!.name}`)
    expect(names(b)).toEqual(names(a))
  }, 60_000)

  it('reads IGES', async () => {
    const { stats, model } = await parseSource('iges', file(`${occtFiles}/cube-10x10mm/Cube 10x10.igs`), 'cube.igs', deps)
    expect(stats.triangles).toBeGreaterThanOrEqual(12)
    // The file declares black everywhere (an IGES default): read as "no colour", not as an invisible black part.
    expect(model.meshes.every((mesh) => mesh.color === null && mesh.groups.length === 0)).toBe(true)
    expect(stats.bbox.max[0] - stats.bbox.min[0]).toBeCloseTo(10, 1)
  }, 60_000)

  it('maps unreadable input and oversized files to codes', async () => {
    expect(await failure(parseSource('step', text('ISO-10303-21;\nHEADER;\nENDSEC;\n'), 'bad.stp', deps))).toMatch(/corrupt|empty/)
    const big = new ArrayBuffer(MAX_CONVERT_BYTES + 1)
    expect(await failure(parseSource('step', big, 'big.stp', { loadOcct: () => Promise.reject(new Error('must not load')) }))).toBe('too_large')
  }, 60_000)
})

describe('3MF', () => {
  const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
  const rels = (target: string) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="${target}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  const tetra = (id: number, name: string, extra = '') => `<object id="${id}" name="${name}" type="model"${extra}><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
    </vertices><triangles>
      <triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3" pid="1" p1="1"/><triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2" pid="1" p1="1"/>
    </triangles></mesh></object>`
  const archive = (files: Record<string, string>) => bufferOf(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))
  /** Rewrites the uncompressed size the central directory declares for `name` (what a ZIP bomb lies about). */
  const declare = (zip: ArrayBuffer, name: string, size: number) => {
    const bytes = new Uint8Array(zip.slice(0))
    const view = new DataView(bytes.buffer)
    for (let at = 0; at + 46 < bytes.length; at++) {
      if (view.getUint32(at, true) !== 0x02014b50) continue
      const length = view.getUint16(at + 28, true)
      if (new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + length)) === name) view.setUint32(at + 24, size, true)
    }
    return bufferOf(bytes)
  }

  it('reads objects, components, build transforms, materials and units', async () => {
    const model = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported by a test -->
<model unit="centimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1"><base name="Grey" displaycolor="#808080FF"/><base name="Red" displaycolor="#FF0000"/></basematerials>
    ${tetra(2, 'Tetra &amp; Co', ' pid="1" pindex="0"')}
    <object id="3" name="Pair" type="model"><components>
      <component objectid="2"/>
      <component objectid="2" transform="1 0 0 0 1 0 0 0 1 20 0 0"/>
    </components></object>
  </resources>
  <build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 0 0 5"/></build>
</model>`
    const { model: parsed, stats } = await parseSource('3mf', archive({ '[Content_Types].xml': contentTypes, '_rels/.rels': rels('/3D/3dmodel.model'), '3D/3dmodel.model': model }), 'pair.3mf', deps)
    expect(stats.triangles).toBe(8)
    expect(stats.parts).toBe(2)
    // One shared mesh, two instances.
    expect(parsed.meshes).toHaveLength(1)
    // Centimetres → millimetres, both components and the build offset included.
    expect(stats.bbox.min).toEqual([0, 0, 50])
    expect(stats.bbox.max).toEqual([300, 100, 150])
    const mesh = parsed.meshes[0]!
    expect(mesh.name).toBe('Tetra & Co')
    expect(mesh.groups.map((g) => g.count)).toEqual([2, 2])
    expect(mesh.groups[1]!.color).toEqual([1, 0, 0])
    expect(allPaths(parsed.tree)).toEqual(['0', '0.0', '0.0.0', '0.0.1'])
    expect(nodeAt(parsed.tree, '0.0')!.name).toBe('Pair')
    expect(nodeAt(parsed.tree, '0.0.1')!.matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1])
  })

  it('follows production-extension paths into other model parts', async () => {
    const root = `<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources><object id="1" type="model"><components><component p:path="/3D/Objects/part.model" objectid="7"/></components></object></resources>
  <build><item objectid="1"/></build></model>`
    const part = `<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${tetra(7, 'Shell')}</resources><build/></model>`
    const { stats, model } = await parseSource('3mf', archive({ '_rels/.rels': rels('/3D/3dmodel.model'), '3D/3dmodel.model': root, '3D/Objects/part.model': part }), 'p.3mf', deps)
    expect(stats.triangles).toBe(4)
    expect(nodeAt(model.tree, '0.0.0')!.name).toBe('Shell')
  })

  it('falls back to 3D/3dmodel.model without relationships', async () => {
    const model = `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${tetra(1, 'A')}</resources><build><item objectid="1"/></build></model>`
    const { stats } = await parseSource('3mf', archive({ '3D/3dmodel.model': model }), 'a.3mf', deps)
    expect(stats.triangles).toBe(4)
  })

  it('an object without triangles is empty', async () => {
    const model = `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1"><mesh><vertices/><triangles/></mesh></object></resources><build><item objectid="1"/></build></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': model }), 'e.3mf', deps))).toBe('empty')
  })

  it('maps broken archives and models to corrupt', async () => {
    expect(await failure(parseSource('3mf', text('PK not really'), 'x.3mf', deps))).toBe('corrupt')
    const badIndex = `<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': badIndex }), 'b.3mf', deps))).toBe('corrupt')
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': '<model><resources>' }), 'c.3mf', deps))).toBe('corrupt')
    const missing = `<model><resources/><build><item objectid="9"/></build></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': missing }), 'm.3mf', deps))).toBe('corrupt')
    const cycle = `<model><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': cycle }), 'loop.3mf', deps))).toBe('corrupt')
  })

  it('stops a self-doubling component chain at the node limit, before expanding it', async () => {
    const levels = 30
    const chain = Array.from({ length: levels }, (_, i) => `<object id="${i + 2}"><components><component objectid="${i + 1}"/><component objectid="${i + 1}"/></components></object>`).join('')
    const model = `<model><resources>${tetra(1, 'Leaf')}${chain}</resources><build><item objectid="${levels + 1}"/></build></model>`
    const started = performance.now()
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': model }), 'bomb.3mf', deps))).toBe('too_complex')
    // 2^30 nodes if expanded first; the count stops it after MAX_NODES.
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('refuses an archive whose declared sizes pass the budget before inflating, and ignores entries nobody references', async () => {
    const model = `<model><resources>${tetra(1, 'A')}</resources><build><item objectid="1"/></build></model>`
    const files = { '3D/3dmodel.model': model, '3D/unused.model': model, 'Metadata/thumbnail.png': 'png' }
    // A lying central directory: 600 MB for the root model would be allocated up front.
    expect(await failure(parseSource('3mf', declare(archive(files), '3D/3dmodel.model', 600 * 1024 * 1024), 'bomb.3mf', deps))).toBe('too_large')
    // The same lie on parts the build never reads costs nothing.
    let quiet = declare(archive(files), '3D/unused.model', 0xffff_fff0)
    quiet = declare(quiet, 'Metadata/thumbnail.png', 0xffff_fff0)
    expect((await parseSource('3mf', quiet, 'ok.3mf', deps)).stats.triangles).toBe(4)
  })

  it('caps colours: many distinct triangle colours fall back to the object colour', async () => {
    const count = 300
    const colors = Array.from({ length: count }, (_, i) => `<color color="#${i.toString(16).padStart(6, '0')}"/>`).join('')
    const vertices = Array.from({ length: count * 3 }, (_, i) => `<vertex x="${i}" y="${i % 3}" z="${i % 5}"/>`).join('')
    const triangles = Array.from({ length: count }, (_, i) => `<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}" pid="9" p1="${i}"/>`).join('')
    const model = `<model><resources><colorgroup id="9">${colors}</colorgroup><object id="1"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
    const { model: parsed, stats } = await parseSource('3mf', archive({ '3D/3dmodel.model': model }), 'many.3mf', deps)
    expect(stats.triangles).toBe(count)
    expect(parsed.meshes[0]!.groups).toEqual([])
    // Equal values from different entries share a group (interned per part).
    const twin = `<model><resources><colorgroup id="9"><color color="#FF0000"/><color color="#ff0000"/></colorgroup>${tetra(1, 'T', ' pid="9" pindex="0"').replace('pid="1" p1="1"', 'pid="9" p1="1"').replace('pid="1" p1="1"', 'pid="9" p1="1"')}</resources><build><item objectid="1"/></build></model>`
    const same = await parseSource('3mf', archive({ '3D/3dmodel.model': twin }), 'twin.3mf', deps)
    expect(same.model.meshes[0]!.groups).toEqual([])
    expect(same.model.meshes[0]!.color).toEqual([1, 0, 0])
  })

  it('refuses over-long tags and attribute names, and stays linear on attribute-less runs', async () => {
    const long = `<model><resources><object id="1" name="${'x'.repeat(70_000)}"/></resources><build/></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': long }), 'long.3mf', deps))).toBe('corrupt')
    const started = performance.now()
    const run = `<model><resources><object ${'a'.repeat(60_000)}/></resources><build/></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': run }), 'run.3mf', deps))).toBe('corrupt')
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('a transform that overflows the bounds is corrupt, not a blank model', async () => {
    const model = `<model><resources>${tetra(1, 'A')}</resources><build><item objectid="1" transform="1e308 0 0 0 1 0 0 0 1 0 0 0"/></build></model>`
    expect(await failure(parseSource('3mf', archive({ '3D/3dmodel.model': model }), 'inf.3mf', deps))).toBe('corrupt')
  })
})
