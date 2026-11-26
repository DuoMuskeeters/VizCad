import { Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { normaliseTree } from '../tree/tree'
import type { MeshData, ParsedModel } from '../worker/protocol'
import { buildModel } from './build'
import { disposeObject } from './dispose'

const triangle = (name: string, groups: MeshData['groups'] = []): MeshData => ({
  name,
  color: [1, 0, 0],
  position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  normal: null,
  index: new Uint32Array([0, 1, 2, 0, 1, 3]),
  vertexColor: null,
  groups,
})

describe('buildModel', () => {
  it('writes the node path to userData.vizcadPath on every object (extras in GLB, docs/11 §1.3)', () => {
    const meshes = [triangle('Bolt'), triangle('Plate', [{ first: 0, count: 1, color: null }, { first: 1, count: 1, color: [0, 0, 1] }])]
    const tree = normaliseTree({ name: 'Asm', meshes: [], children: [{ name: 'Sub', meshes: [0, 0], children: [] }, { name: 'Plate', meshes: [1], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1], children: [] }] }, meshes)
    const model: ParsedModel = { meshes, tree, up: 'z' }
    const root = buildModel(model)
    const paths: string[] = []
    root.traverse((object) => {
      if (object !== root) paths.push(`${object.userData['vizcadPath']}:${object.name}`)
    })
    expect(paths).toEqual(['0:Asm', '0.0:Sub', '0.0.0:Bolt', '0.0.1:Bolt', '0.1:Plate'])
    const bolts: Mesh[] = []
    root.traverse((object) => {
      if (object instanceof Mesh && object.name === 'Bolt') bolts.push(object)
    })
    // Instances share one geometry.
    expect(bolts[0]!.geometry).toBe(bolts[1]!.geometry)
    const plate = root.getObjectByName('Plate') as Mesh
    expect(plate.position.x).toBe(5)
    expect(Array.isArray(plate.material) && plate.material.length).toBe(2)
    expect(plate.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }])
    // No normals from the source: flat shading instead of smoothing across sharp CAD edges.
    expect((bolts[0]!.material as unknown as { flatShading: boolean }).flatShading).toBe(true)
    expect(disposeObject(root)).toEqual({ geometries: 2, materials: 2 })
  })

  it('turns a Y-up source into the Z-up world', () => {
    const meshes = [triangle('A')]
    const root = buildModel({ meshes, tree: normaliseTree({ name: 'a', meshes: [0], children: [] }, meshes), up: 'y' })
    expect(root).toBeInstanceOf(Group)
    expect(root.rotation.x).toBeCloseTo(Math.PI / 2)
  })
})
