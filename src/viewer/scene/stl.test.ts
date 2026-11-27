import { describe, expect, it } from 'vitest'
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { STL_CHUNK_TRIANGLES, STL_MAX_BYTES } from '../../shared/stl'
import { countTriangles, stlBytes, writeStl } from './stl'

const join = (pieces: ArrayBuffer[] | null) => {
  if (pieces === null) throw new Error('over the cap')
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.byteLength, 0))
  let at = 0
  for (const piece of pieces) {
    out.set(new Uint8Array(piece), at)
    at += piece.byteLength
  }
  return out.buffer
}

const read = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  const corners: number[][] = []
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12
    for (let k = 0; k < 3; k++) corners.push([0, 1, 2].map((i) => view.getFloat32(at + k * 12 + i * 4, true)))
  }
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 80)).replace(/\0+$/, '')
  return { count, corners, header }
}

describe('writeStl', () => {
  it('refuses a part past its own cap, before writing anything', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    const index = new BufferAttribute(new Uint32Array(3), 1)
    // Claims just over the cap without allocating it.
    const counted = index as { count: number }
    counted.count = 3 * (Math.floor((STL_MAX_BYTES - 84) / 50) + 1)
    geometry.setIndex(index)
    const mesh = new Mesh(geometry, new MeshStandardMaterial())
    expect(writeStl(mesh, { centered: false, name: 'big' })).toBeNull()
    counted.count = 3
    expect(writeStl(mesh, { centered: false, name: 'small' })).not.toBeNull()
  })

  const assembly = () => {
    const root = new Group()
    root.rotation.x = Math.PI / 2
    const part = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial())
    part.position.set(10, 0, 0)
    const holder = new Group()
    holder.add(part)
    root.add(holder)
    return { root, holder, part }
  }

  it('writes every triangle with world transforms (the part stays where it is in the assembly)', () => {
    const { holder } = assembly()
    expect(countTriangles(holder)).toBe(12)
    const buffer = join(writeStl(holder, { centered: false, name: 'Gövde' }))
    expect(buffer.byteLength).toBe(stlBytes(12))
    const { count, corners, header } = read(buffer)
    expect(count).toBe(12)
    expect(header).toBe('VizCad part G_vde')
    const xs = corners.map((p) => p[0]!)
    expect(Math.min(...xs)).toBeCloseTo(9)
    expect(Math.max(...xs)).toBeCloseTo(11)
  })

  it('moves the box centre to the origin when centered', () => {
    const { holder } = assembly()
    const { corners } = read(join(writeStl(holder, { centered: true, name: 'x' })))
    for (const k of [0, 1, 2]) {
      const values = corners.map((p) => p[k]!)
      expect(Math.min(...values)).toBeCloseTo(-1)
      expect(Math.max(...values)).toBeCloseTo(1)
    }
  })

  it('writes an empty STL for a node without meshes', () => {
    const buffer = join(writeStl(new Group(), { centered: false, name: 'empty' }))
    expect(read(buffer).count).toBe(0)
  })

  it('keeps a mirrored instance facing outwards (corners swapped)', () => {
    const triangle = () => new Mesh(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)), new MeshStandardMaterial())
    const normalOf = (mesh: Mesh) => {
      const view = new DataView(join(writeStl(mesh, { centered: false, name: 'n' })))
      return new Vector3(view.getFloat32(84, true), view.getFloat32(88, true), view.getFloat32(92, true))
    }
    const plain = triangle()
    expect(normalOf(plain).z).toBeCloseTo(1)
    // Mirrored in X: the triangle lies the same way up, its face must still point +Z.
    const mirrored = triangle()
    mirrored.scale.set(-1, 1, 1)
    expect(normalOf(mirrored).z).toBeCloseTo(1)
  })

  it('writes in pieces past the chunk size, the count in the header', () => {
    const count = STL_CHUNK_TRIANGLES + 5
    const big = new Mesh(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(count * 9), 3)), new MeshStandardMaterial())
    const pieces = writeStl(big, { centered: false, name: 'big' })!
    expect(pieces.map((p) => p.byteLength)).toEqual([84, STL_CHUNK_TRIANGLES * 50, 5 * 50])
    expect(new DataView(pieces[0]!).getUint32(80, true)).toBe(count)
  })
})
