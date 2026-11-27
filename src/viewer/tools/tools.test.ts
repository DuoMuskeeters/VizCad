// @vitest-environment jsdom
import { Mesh, type Object3D, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildModel } from '../scene/build'
import { normaliseTree } from '../tree/tree'
import type { MeshData, ParsedModel, Stats } from '../worker/protocol'
import type { MeasureState } from './types'

// jsdom has no WebGL: a stub renderer keeps what the tools set on it.
const calls = vi.hoisted(() => ({ ratio: [] as number[], sizes: [] as Array<[number, number]>, clear: [] as Array<[unknown, number | undefined]> }))
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  class StubRenderer {
    autoClear = true
    clippingPlanes: unknown[] = []
    domElement: HTMLCanvasElement
    info = { memory: { geometries: 0, textures: 0 } }
    render = vi.fn()
    dispose = vi.fn()
    forceContextLoss = vi.fn()
    renderLists = { dispose: vi.fn() }
    ratio = 1
    constructor(options: { canvas: HTMLCanvasElement }) {
      this.domElement = options.canvas
    }
    setPixelRatio(ratio: number) {
      this.ratio = ratio
      calls.ratio.push(ratio)
    }
    getPixelRatio() {
      return this.ratio
    }
    setClearColor(color: unknown, alpha?: number) {
      calls.clear.push([color, alpha])
    }
    getClearColor(target: InstanceType<typeof three.Color>) {
      return target.set(0x1b222c)
    }
    getClearAlpha() {
      return 1
    }
    setSize(width: number, height: number) {
      calls.sizes.push([width, height])
    }
    clear() {}
  }
  return { ...three, WebGLRenderer: StubRenderer }
})
vi.mock('three/examples/jsm/helpers/ViewHelper.js', () => ({
  ViewHelper: class {
    location = { top: 0, right: 0 }
    setLabels() {}
    render() {}
    dispose() {}
  },
}))

const { createScene } = await import('../scene/createScene')
const { createTools } = await import('./tools')

const stats: Stats = { triangles: 4, nodes: 3, parts: 2, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }
const mesh = (name: string): MeshData => ({
  name, color: null, position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), normal: null, index: new Uint32Array([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]), vertexColor: null, groups: [],
})
const model = (): ParsedModel => {
  const meshes = [mesh('A'), mesh('B')]
  return { meshes, tree: normaliseTree({ name: 'm', meshes: [0, 1], children: [] }, meshes), up: 'z' }
}
const meshesIn = (root: Object3D) => {
  const out: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh) out.push(object)
  })
  return out
}

beforeEach(() => {
  calls.ratio.length = 0
  calls.sizes.length = 0
  calls.clear.length = 0
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onPick = vi.fn()
  const scene = createScene(container, 'label', { onPick })
  const root = buildModel(model())
  scene.setModel(root, stats)
  const host = scene.host()
  const canvas = host.canvas
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.hasPointerCapture = () => false
  const tools = createTools(host)
  const tap = (x: number, y: number, pointerType = 'mouse') => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true })
      Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 }, pointerType: { value: pointerType } })
      canvas.dispatchEvent(event)
    }
  }
  /** Where a model point is on the 100 × 100 canvas. */
  const at = (x: number, y: number, z: number): [number, number] => {
    const v = new Vector3(x, y, z).project(host.camera)
    return [((v.x + 1) / 2) * 100, ((1 - v.y) / 2) * 100]
  }
  return { container, scene, root, host, tools, onPick, tap, at }
}

describe('section', () => {
  it('clips with one plane, fills the cut with a stencil cap kept outside the model, and turns off', () => {
    const { host, tools, root, scene } = setup()
    tools.section.set({ axis: 'x', position: 0.25, flipped: false, hatch: true, handle: true })
    const range = tools.section.range('x')!
    expect(range.min).toBeCloseTo(0)
    expect(range.max).toBeCloseTo(1)
    const planes = host.renderer.clippingPlanes
    expect(planes).toHaveLength(1)
    // The low side stays: x = 0.1 is kept, x = 0.5 is cut away.
    expect(planes[0]!.normal.x).toBe(-1)
    expect(planes[0]!.constant).toBeCloseTo(0.25)
    // A back and a front stencil mesh per model mesh plus the cap: none of them in the model (STL, edges stay clean).
    expect(meshesIn(host.scene).length).toBe(meshesIn(root).length * 3 + 1)
    expect(meshesIn(root).every((m) => m.children.length === 0)).toBe(true)

    tools.section.set({ axis: 'z', position: 1, flipped: true, hatch: false, handle: false })
    expect(host.renderer.clippingPlanes[0]!.normal.z).toBe(1)
    tools.section.set(null)
    expect(host.renderer.clippingPlanes).toEqual([])

    tools.dispose()
    expect(meshesIn(host.scene).length).toBe(meshesIn(root).length)
    expect(host.container.querySelectorAll('canvas')).toHaveLength(1)
    scene.dispose()
  })

  it('a pick does not land on the side the plane cut away', () => {
    const { tools, tap, at, onPick, scene } = setup()
    tap(...at(0.4, 0.3, 0.3))
    expect(onPick).toHaveBeenLastCalledWith(expect.any(String))
    // Flipped at x = 0.9: only x ≥ 0.9 stays. The ray enters at x = 0.4 and runs on to lower x: nothing left to hit.
    tools.section.set({ axis: 'x', position: 0.9, flipped: true, hatch: true, handle: false })
    tap(...at(0.4, 0.3, 0.3))
    expect(onPick).toHaveBeenLastCalledWith(null)
    scene.dispose()
  })
})

describe('measure', () => {
  it('two clicks make a measurement instead of a pick; stop keeps it drawn, clear removes it', () => {
    const { tools, tap, at, onPick, scene } = setup()
    const states: MeasureState[] = []
    tools.measure.subscribe((state) => states.push(state))
    tools.measure.start('mouse', false)
    tap(...at(0.4, 0.3, 0.3))
    expect(states.at(-1)!.pending).not.toBeNull()
    tap(...at(0.3, 0.3, 0.4))
    const done = states.at(-1)!
    expect(done.pending).toBeNull()
    expect(done.list).toHaveLength(1)
    expect(done.list[0]!.distance).toBeGreaterThan(0)
    expect(done.list[0]!.a.path).toMatch(/^0/)
    expect(onPick).not.toHaveBeenCalled()

    tools.measure.stop()
    expect(states.at(-1)!.list).toHaveLength(1)
    tap(...at(0.4, 0.3, 0.3))
    expect(onPick).toHaveBeenCalledTimes(1)
    tools.measure.clear()
    expect(states.at(-1)!.list).toEqual([])
    scene.dispose()
  })

  it('a phone keeps one measurement: a new first point starts over', () => {
    const { tools, tap, at, scene } = setup()
    let state: MeasureState = { list: [], pending: null }
    tools.measure.subscribe((next) => {
      state = next
    })
    tools.measure.start('touch', true)
    tap(...at(0.4, 0.3, 0.3), 'touch')
    tap(...at(0.3, 0.3, 0.4), 'touch')
    expect(state.list).toHaveLength(1)
    tap(...at(0.3, 0.4, 0.3), 'touch')
    expect(state.list).toEqual([])
    expect(state.pending).not.toBeNull()
    scene.dispose()
  })

  it('a new model clears the measurements', () => {
    const { tools, tap, at, scene } = setup()
    let state: MeasureState = { list: [], pending: null }
    tools.measure.subscribe((next) => {
      state = next
    })
    tools.measure.start('mouse', false)
    tap(...at(0.4, 0.3, 0.3))
    tap(...at(0.3, 0.3, 0.4))
    expect(state.list).toHaveLength(1)
    scene.setModel(buildModel(model()), stats)
    expect(state.list).toEqual([])
    scene.dispose()
  })
})

describe('touch on the canvas', () => {
  it('a double tap fits instead of picking twice', () => {
    const { tap, at, onPick, scene } = setup()
    tap(...at(0.4, 0.3, 0.3), 'touch')
    tap(...at(0.4, 0.3, 0.3), 'touch')
    expect(onPick).toHaveBeenCalledTimes(1)
    scene.dispose()
  })
})

describe('screenshot', () => {
  it('draws at twice the ratio with the asked background, then puts the screen back', async () => {
    const { tools, scene } = setup()
    calls.ratio.length = 0
    calls.clear.length = 0
    // jsdom has no 2D canvas: the shot ends empty, but the renderer must be restored all the same.
    await expect(tools.screenshot({ background: 'white', scale: 2, pins: true, measures: true })).resolves.toBeNull()
    expect(calls.ratio).toEqual([2, 1])
    expect(calls.clear[0]).toEqual([0xffffff, 1])
    expect(calls.clear.at(-1)![1]).toBe(1)
    scene.dispose()
  })
})
