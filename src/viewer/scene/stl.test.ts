import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { countTriangles, stlBytes, writeStl } from './stl'

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
    const buffer = writeStl(holder, { centered: false, name: 'Gövde' })
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
    const { corners } = read(writeStl(holder, { centered: true, name: 'x' }))
    for (const k of [0, 1, 2]) {
      const values = corners.map((p) => p[k]!)
      expect(Math.min(...values)).toBeCloseTo(-1)
      expect(Math.max(...values)).toBeCloseTo(1)
    }
  })

  it('writes an empty STL for a node without meshes', () => {
    const buffer = writeStl(new Group(), { centered: false, name: 'empty' })
    expect(read(buffer).count).toBe(0)
  })
})
