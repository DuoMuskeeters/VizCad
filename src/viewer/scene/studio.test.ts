import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector2, type Material, type Object3D } from 'three'
import { createStudio, EMPTY_VIEW, outlineOf, visibleIn, type StudioView } from './studio'

const tag = <T extends Object3D>(object: T, path: string, name: string): T => {
  object.userData['vizcadPath'] = path
  object.name = name
  return object
}

/** 0 Pump { 0.0 Frame (mesh), 0.1 Motor { 0.1.0 Body (mesh), 0.1.1 Fan (GLB-like node with two primitives) } } */
const model = () => {
  const material = new MeshStandardMaterial({ color: 0x888888 })
  const root = new Group()
  const top = tag(new Group(), '0', 'Pump')
  const frame = tag(new Mesh(new BoxGeometry(4, 1, 1), material), '0.0', 'Frame')
  frame.position.set(0, 0, -2)
  const motor = tag(new Group(), '0.1', 'Motor')
  const body = tag(new Mesh(new BoxGeometry(1, 1, 1), material), '0.1.0', 'Body')
  const fan = tag(new Group(), '0.1.1', 'Fan_1')
  fan.userData['name'] = 'Fan 1'
  const blade = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  const hub = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  fan.position.set(3, 0, 0)
  fan.add(blade, hub)
  // Children out of order: the outline sorts by index.
  motor.add(fan, body)
  top.add(frame, motor)
  root.add(top)
  root.updateMatrixWorld(true)
  return { root, frame, body, fan, blade, material }
}

const view = (patch: Partial<StudioView>): StudioView => ({ ...EMPTY_VIEW, ...patch })

describe('studio', () => {
  it('builds the outline: paths in order, file names, parts and drawn nodes', () => {
    const { root } = model()
    const outline = outlineOf(root.children[0]!)
    expect(outline).toMatchObject({ path: '0', name: 'Pump', parts: 3, drawn: false })
    expect(outline.children.map((c) => c.path)).toEqual(['0.0', '0.1'])
    expect(outline.children[1]!.children.map((c) => [c.path, c.name, c.drawn, c.parts])).toEqual([
      ['0.1.0', 'Body', true, 1],
      ['0.1.1', 'Fan 1', true, 1],
    ])
  })

  it('hides, isolates and shows the way to the isolated node', () => {
    const iso = { isolated: '0.1', hidden: new Set(['0.1.0', '0.0']) }
    expect(visibleIn('0', iso)).toBe(true)
    expect(visibleIn('0.0', iso)).toBe(false)
    expect(visibleIn('0.1', iso)).toBe(true)
    expect(visibleIn('0.1.0', iso)).toBe(false)
    expect(visibleIn('0.1.1', iso)).toBe(true)
    expect(visibleIn('0.0', { isolated: null, hidden: new Set() })).toBe(true)
    const { root, frame, body } = model()
    const studio = createStudio(root)
    studio.apply(view({ isolated: '0.1' }))
    expect(frame.visible).toBe(false)
    expect(body.visible).toBe(true)
    studio.apply(EMPTY_VIEW)
    expect(frame.visible).toBe(true)
  })

  it('applies looks to the subtree, the nearest colour and finish winning, and highlights the selection', () => {
    const { root, frame, body, blade, material } = model()
    const studio = createStudio(root)
    studio.apply(view({ looks: new Map([['0.1', { color: '#b23a2e', finish: 'metal' }], ['0.1.1', { color: '#2f5f99' }]]), selected: '0.0' }))
    const bodyMaterial = body.material as MeshStandardMaterial
    expect(bodyMaterial.color.getHexString()).toBe('b23a2e')
    expect(bodyMaterial.metalness).toBeCloseTo(0.8)
    const bladeMaterial = blade.material as MeshStandardMaterial
    expect(bladeMaterial.color.getHexString()).toBe('2f5f99')
    expect(bladeMaterial.metalness).toBeCloseTo(0.8)
    const frameMaterial = frame.material as MeshStandardMaterial
    expect(frameMaterial).not.toBe(material)
    expect(frameMaterial.emissive.getHex()).not.toBe(0)
    studio.apply(EMPTY_VIEW)
    expect(frame.material).toBe(material)
    expect(body.material).toBe(material)
  })

  it('puts the model materials back and frees its own on dispose', () => {
    const { root, body, material } = model()
    const studio = createStudio(root)
    studio.apply(view({ looks: new Map([['0', { color: '#ffffff' }]]), selected: '0.1' }))
    const own = body.material as Material
    let freed = 0
    own.addEventListener('dispose', () => void freed++)
    studio.dispose()
    expect(body.material).toBe(material)
    expect(freed).toBe(1)
  })

  it('picks the visible part under the ray, as its node path (a GLB primitive answers with its node)', () => {
    const { root } = model()
    const studio = createStudio(root)
    const camera = new PerspectiveCamera(35, 1, 0.1, 1000)
    camera.position.set(3, -20, 0)
    camera.up.set(0, 0, 1)
    camera.lookAt(3, 0, 0)
    camera.updateMatrixWorld(true)
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(studio.pick(ray)).toBe('0.1.1')
    studio.apply(view({ hidden: new Set(['0.1.1']) }))
    expect(studio.pick(ray)).toBeNull()
    expect(studio.boundsOf('0.1.1')?.min.x).toBeCloseTo(2.5)
    expect(studio.boundsOf('0.9')).toBeNull()
    expect(studio.colorOf('0.1.0')).toBe('#888888')
  })
})
