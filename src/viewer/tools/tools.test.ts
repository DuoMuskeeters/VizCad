// @vitest-environment jsdom
import { Mesh, type Object3D, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildModel } from '../scene/build'
import { normaliseTree } from '../tree/tree'
import type { MeshData, ParsedModel, Stats } from '../worker/protocol'
import type { MeasureState } from './types'

// jsdom has no WebGL: a stub renderer keeps what the tools set on it.
const calls = vi.hoisted(() => ({
  ratio: [] as number[],
  sizes: [] as Array<[number, number]>,
  clear: [] as Array<[unknown, number | undefined]>,
  /** How many clipping planes the renderer had while the axes gizmo drew. */
  gizmo: [] as number[],
  frames: [] as FrameRequestCallback[],
  /** Vector3s made (per-frame allocation check). */
  vectors: 0,
}))
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
  class CountedVector3 extends three.Vector3 {
    constructor(x?: number, y?: number, z?: number) {
      super(x, y, z)
      calls.vectors++
    }
  }
  return { ...three, WebGLRenderer: StubRenderer, Vector3: CountedVector3 }
})
vi.mock('three/examples/jsm/helpers/ViewHelper.js', () => ({
  ViewHelper: class {
    location = { top: 0, right: 0 }
    setLabels() {}
    render(renderer: { clippingPlanes: unknown[] }) {
      calls.gizmo.push(renderer.clippingPlanes.length)
    }
    dispose() {}
  },
}))

const { createScene } = await import('../scene/createScene')
const { createTools } = await import('./tools')

const stats: Stats = { triangles: 4, nodes: 3, parts: 2, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }
/** A closed tetrahedron (0,0,0) (1,0,0) (0,1,0) (0,0,1), moved along x by `dx`. */
const mesh = (name: string, dx = 0): MeshData => ({
  name, color: null, position: new Float32Array([dx, 0, 0, dx + 1, 0, 0, dx, 1, 0, dx, 0, 1]), normal: null, index: new Uint32Array([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]), vertexColor: null, groups: [],
})
const model = (meshes = [mesh('A'), mesh('B')]): ParsedModel => ({ meshes, tree: normaliseTree({ name: 'm', meshes: meshes.map((_, i) => i), children: [] }, meshes), up: 'z' })
/** A flat 1 × 1 square on z = 0, two triangles sharing the diagonal (0,0)–(1,1). */
const square = (): ParsedModel =>
  model([{ name: 'S', color: null, position: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), normal: null, index: new Uint32Array([0, 1, 2, 0, 2, 3]), vertexColor: null, groups: [] }])
/** A closed 10 × 10 × 10 box around the origin (12 triangles). */
const box10 = (): ParsedModel => {
  const p: number[] = []
  for (const x of [-5, 5]) for (const y of [-5, 5]) for (const z of [-5, 5]) p.push(x, y, z)
  // Corner i: x = bit 2, y = bit 1, z = bit 0.
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
  const index = quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!])
  return model([{ name: 'Box', color: null, position: new Float32Array(p), normal: null, index: new Uint32Array(index), vertexColor: null, groups: [] }])
}

/** A 2D context that records what is drawn (jsdom has none). */
const recorder = () => {
  const log: Array<[string, unknown[]]> = []
  const target: Record<string, unknown> = { log, measureText: () => ({ width: 40 }) }
  const ctx = new Proxy(target, {
    get: (t, key: string) => (key in t ? t[key] : (...args: unknown[]) => void log.push([key, args])),
    set: (t, key: string, value: unknown) => {
      t[key] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, calls: (name: string) => log.filter(([key]) => key === name).map(([, args]) => args) }
}
const SIZE = 600
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
  calls.gizmo.length = 0
  calls.frames.length = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => calls.frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setup = (parsed: ParsedModel = model()) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onPick = vi.fn()
  const scene = createScene(container, 'label', { onPick })
  const root = buildModel(parsed)
  scene.setModel(root, stats)
  const host = scene.host()
  const canvas = host.canvas
  // A 600 × 600 canvas (wide enough for the axes gizmo).
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: SIZE, height: SIZE }) as DOMRect
  Object.defineProperties(canvas, { clientWidth: { configurable: true, value: SIZE }, clientHeight: { configurable: true, value: SIZE } })
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.hasPointerCapture = () => false
  const tools = createTools(host)
  const pointer = (type: string, x: number, y: number, { id = 1, pointerType = 'mouse', primary = true, buttons = 0 } = {}) => {
    const event = new MouseEvent(type, { button: 0, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true })
    Object.defineProperties(event, { isPrimary: { value: primary }, pointerId: { value: id }, pointerType: { value: pointerType } })
    canvas.dispatchEvent(event)
  }
  const tap = (x: number, y: number, pointerType = 'mouse') => {
    pointer('pointerdown', x, y, { pointerType })
    pointer('pointerup', x, y, { pointerType })
  }
  /** Where a model point is on the canvas. */
  const at = (x: number, y: number, z: number): [number, number] => {
    const v = new Vector3(x, y, z).project(host.camera)
    return [((v.x + 1) / 2) * SIZE, ((1 - v.y) / 2) * SIZE]
  }
  /** Runs the queued animation frames (the scene's loop draws, then the tools' overlay). */
  const frame = () => {
    host.redraw()
    for (const callback of calls.frames.splice(0)) callback(0)
  }
  let state: MeasureState = { list: [], pending: null }
  tools.measure.subscribe((next) => {
    state = next
  })
  return { container, scene, root, host, tools, onPick, tap, at, pointer, frame, measured: () => state }
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

  it('the axes gizmo is never cut by the section plane', () => {
    const { host, tools, scene } = setup()
    tools.section.set({ axis: 'x', position: 0.25, flipped: false, hatch: true, handle: false })
    calls.gizmo.length = 0
    host.drawNow(true)
    expect(calls.gizmo).toEqual([0])
    expect(host.renderer.clippingPlanes).toHaveLength(1)
    scene.dispose()
  })

  it('fits the range to the isolated part', () => {
    const { tools, scene } = setup(model([mesh('A'), mesh('B', 4)]))
    expect(tools.section.range('x')).toMatchObject({ min: 0, max: 5 })
    const b = scene.outline()!.children[1]!.path
    tools.section.setScope(b)
    expect(tools.section.range('x')!.min).toBeCloseTo(4)
    expect(tools.section.range('x')!.max).toBeCloseTo(5)
    tools.section.setScope(null)
    expect(tools.section.range('x')).toMatchObject({ min: 0, max: 5 })
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

  it('a click on a cut face measures on the plane, not on the far wall behind it', () => {
    // A 10 mm box cut at z = 0 (the top half cut away): the camera looks from above, through the cut.
    const { tools, tap, at, measured, scene } = setup(box10())
    tools.section.set({ axis: 'z', position: 0.5, flipped: false, hatch: true, handle: false })
    tools.measure.start('mouse', false)
    tap(...at(1, -1, 0))
    const point = measured().pending!.point
    expect(point[2]).toBeCloseTo(0, 5)
    expect(point[0]).toBeCloseTo(1, 3)
    expect(point[1]).toBeCloseTo(-1, 3)
    // Off the cut, the box's kept outside is still hit as before.
    tap(...at(5, -2, -3))
    expect(measured().list[0]!.b.point[0]).toBeCloseTo(5, 3)
    scene.dispose()
  })

  it('does not snap to a corner the plane cut away', () => {
    const { tools, tap, at, measured, scene } = setup(box10())
    tools.measure.start('mouse', false)
    // Next to the top corner (5, −5, 5), on the box's front face.
    const [x, y] = at(5, -5, 5)
    tap(x - 3, y + 3)
    expect(measured().pending).toMatchObject({ snap: 'vertex', point: [5, -5, 5] })
    tools.measure.clear()
    // Cut just under that corner: the kept face there is the cap, and the corner is gone.
    tools.section.set({ axis: 'z', position: 0.99, flipped: false, hatch: true, handle: false })
    tap(x - 3, y + 3)
    expect(measured().pending?.snap).not.toBe('vertex')
    scene.dispose()
  })

  it('an edge snap is a point on the 3D edge; a face diagonal is not an edge', () => {
    const { tools, tap, at, measured, scene } = setup(square())
    tools.measure.start('mouse', false)
    // Just beside the outer edge y = 0, a third of the way along: on the edge itself.
    tap(...at(0.3, 0.005, 0))
    const edge = measured().pending!
    expect(edge.snap).toBe('edge')
    expect(edge.point[1]).toBeCloseTo(0, 6)
    expect(edge.point[2]).toBeCloseTo(0, 6)
    expect(edge.point[0]).toBeGreaterThan(0.25)
    expect(edge.point[0]).toBeLessThan(0.35)
    tools.measure.clear()
    // On the diagonal (0,0)–(1,1) both triangles share: the surface, never "Edge".
    tap(...at(0.5, 0.5, 0))
    expect(measured().pending!.snap).toBe('surface')
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

describe('pins', () => {
  it('a click in pin mode gives the node and the point in its own coordinates; a tap on a drawn pin selects it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { tools, tap, at, onPick, host, scene, pointer } = setup()
    const placed: Array<{ path: string; point: readonly number[] }> = []
    tools.pins.start((pin) => placed.push(pin))
    tap(...at(0.4, 0.3, 0.3))
    expect(onPick).not.toHaveBeenCalled()
    expect(placed).toHaveLength(1)
    const pin = placed[0]!
    const node = host.studio()!.objectAt(pin.path)!
    const world = node.localToWorld(new Vector3(...(pin.point as [number, number, number])))
    expect(world.x + world.y + world.z).toBeCloseTo(1, 4)
    tools.pins.stop()
    // Stopping the measure tool later must not take the click from someone else.
    tools.measure.stop()
    const selected: string[] = []
    tools.pins.onSelect((id) => selected.push(id))
    tools.pins.set([{ id: 'c1', label: '1', path: pin.path, point: pin.point as [number, number, number], active: false }])
    const [px, py] = at(world.x, world.y, world.z)
    tap(px, py)
    // Told after the release and its click are over (no ghost tap); no part is picked for it.
    expect(selected).toEqual([])
    vi.runAllTimers()
    expect(selected).toEqual(['c1'])
    expect(onPick).not.toHaveBeenCalled()
    // A drag that starts on a pin is an orbit: the controls hear the press, and nothing is selected.
    const orbit = vi.fn()
    host.canvas.addEventListener('pointerdown', orbit)
    pointer('pointerdown', px, py, { buttons: 1 })
    expect(orbit).toHaveBeenCalledTimes(1)
    pointer('pointermove', px + 40, py, { buttons: 1 })
    pointer('pointerup', px + 40, py)
    vi.runAllTimers()
    expect(selected).toEqual(['c1'])
    // Away from the pin, a click picks as before.
    tap(...at(0.85, 0.1, 0.05))
    expect(onPick).toHaveBeenCalledTimes(1)
    scene.dispose()
  })
})

describe('pins, drawn each frame', () => {
  it('make no new vectors however many pins there are', () => {
    const o = setup()
    const draw = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => draw.ctx) as never)
    const path = o.scene.outline()!.children[0]!.path
    const count = () => {
      o.frame()
      const before = calls.vectors
      o.frame()
      return calls.vectors - before
    }
    const none = count()
    o.tools.pins.set(Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, label: String(i + 1), path, point: [0.1 * i, 0.1, 0.1] as const, active: i === 0 })))
    expect(count()).toBe(none)
    expect(draw.calls('fillText').map((args) => args[0])).toContain('6')
    o.scene.dispose()
  })
})

describe('touch on the canvas', () => {
  it('a double tap fits instead of picking twice', () => {
    const { tap, at, onPick, scene, host } = setup()
    const fitted = host.camera.position.distanceTo(host.controls.target)
    const target = at(0.4, 0.3, 0.3)
    // Zoomed far out: the fit brings the camera back.
    host.camera.position.multiplyScalar(3)
    tap(...target, 'touch')
    tap(...target, 'touch')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(host.camera.position.distanceTo(host.controls.target)).toBeCloseTo(fitted, 2)
    scene.dispose()
  })

  const aimAt = (o: ReturnType<typeof setup>, x: number, y: number) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    o.tools.measure.start('touch', true)
    o.pointer('pointerdown', x, y, { pointerType: 'touch' })
    vi.advanceTimersByTime(300)
  }

  it('hold, then the magnifier: the orbit stops, the snap ring sits where the point goes, lifting places it', () => {
    const o = setup()
    const draw = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => draw.ctx) as never)
    // A finger a few pixels off the corner (0, 0, 1): it snaps to the corner.
    const [cx, cy] = o.at(0, 0, 1)
    aimAt(o, cx + 4, cy + 6)
    expect(o.host.controls.enabled).toBe(false)
    draw.log.length = 0
    o.frame()
    // The loupe (radius 56) shows the canvas around the finger, then the ring (radius 7) at the corner's offset × 2.5.
    const loupe = draw.calls('arc').find((args) => args[2] === 56)!
    const ring = draw.calls('arc').find((args) => args[2] === 7)!
    expect(draw.calls('drawImage')).toHaveLength(1)
    expect(ring[0] as number).toBeCloseTo((loupe[0] as number) - 4 * 2.5, 1)
    expect(ring[1] as number).toBeCloseTo((loupe[1] as number) - 6 * 2.5, 1)
    o.pointer('pointerup', cx + 4, cy + 6, { pointerType: 'touch' })
    expect(o.host.controls.enabled).toBe(true)
    expect(o.measured().pending).toMatchObject({ snap: 'vertex', point: [0, 0, 1] })
    o.scene.dispose()
  })

  it('a second finger neither moves nor places the aim; a cancelled press places nothing', () => {
    const o = setup()
    const target = o.at(0.4, 0.3, 0.3)
    aimAt(o, ...target)
    // Another finger slides off the model and lifts: the aim stays on the first finger's point.
    o.pointer('pointermove', 1, 1, { id: 2, pointerType: 'touch', primary: false })
    o.pointer('pointerup', 1, 1, { id: 2, pointerType: 'touch', primary: false })
    expect(o.measured().pending).toBeNull()
    expect(o.host.controls.enabled).toBe(false)
    o.pointer('pointerup', ...target, { pointerType: 'touch' })
    expect(o.measured().pending).not.toBeNull()
    o.tools.measure.clear()

    aimAt(o, ...target)
    o.pointer('pointercancel', ...target, { pointerType: 'touch' })
    expect(o.measured().pending).toBeNull()
    expect(o.host.controls.enabled).toBe(true)
    // Nothing waits to be placed by a later lift either.
    o.pointer('pointerup', ...target, { pointerType: 'touch' })
    expect(o.measured().pending).toBeNull()
    o.scene.dispose()
  })
})

describe('section handle (desktop)', () => {
  const handleAt = (o: ReturnType<typeof setup>) => {
    const draw = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => draw.ctx) as never)
    o.frame()
    const ring = draw.calls('arc').find((args) => args[2] === 22)
    vi.restoreAllMocks()
    return ring === undefined ? null : ([ring[0] as number, ring[1] as number] as const)
  }

  it('drags the plane along its axis, and the orbit never hears it', () => {
    const o = setup()
    const moved = vi.fn()
    o.tools.section.onDrag(moved)
    o.tools.section.set({ axis: 'x', position: 0.5, flipped: false, hatch: true, handle: true })
    const [x, y] = handleAt(o)!
    const orbit = vi.fn()
    o.host.canvas.addEventListener('pointerdown', orbit)
    o.pointer('pointerdown', x, y, { buttons: 1 })
    expect(orbit).not.toHaveBeenCalled()
    // Along +x on screen: from the handle towards the point one unit further along x.
    const [ax, ay] = o.at(1, 0.5, 0.5)
    o.pointer('pointermove', x + (ax - x) * 0.2, y + (ay - y) * 0.2, { buttons: 1 })
    o.pointer('pointerup', x + (ax - x) * 0.2, y + (ay - y) * 0.2)
    expect(moved).toHaveBeenCalled()
    expect(moved.mock.lastCall![0]).toBeGreaterThan(0.5)
    expect(o.host.renderer.clippingPlanes[0]!.constant).toBeCloseTo(moved.mock.lastCall![0], 5)
    o.scene.dispose()
  })

  it('keeps out from under the open card, and is gone without the handle', () => {
    const o = setup()
    o.tools.section.set({ axis: 'z', position: 0.5, flipped: false, hatch: true, handle: true })
    const [x] = handleAt(o)!
    // A card over the left half of the canvas, the handle under it.
    o.tools.section.setCovered({ left: 0, top: 0, right: x + 50, bottom: SIZE })
    const [nx] = handleAt(o)!
    expect(nx).toBeGreaterThan(x + 50 + 22)
    // The handle at its new place still grabs.
    const moved = vi.fn()
    o.tools.section.onDrag(moved)
    const [, ny] = handleAt(o)!
    o.pointer('pointerdown', nx, ny, { buttons: 1 })
    o.pointer('pointermove', nx, ny - 40, { buttons: 1 })
    o.pointer('pointerup', nx, ny - 40)
    expect(moved).toHaveBeenCalled()
    o.tools.section.set({ axis: 'z', position: 0.5, flipped: false, hatch: true, handle: false })
    expect(handleAt(o)).toBeNull()
    o.scene.dispose()
  })
})

describe('screenshot', () => {
  const shoot = async (o: ReturnType<typeof setup>, options: Parameters<ReturnType<typeof setup>['tools']['screenshot']>[0]) => {
    const draw = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => draw.ctx) as never)
    let captured: HTMLCanvasElement | null = null
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) {
      captured = this
      callback(new Blob(['png'], { type: 'image/png' }))
    })
    const blob = await o.tools.screenshot(options)
    return { blob, draw, captured: captured as HTMLCanvasElement | null }
  }

  it('draws the model and the measurements onto the image; without them only the model; the capture canvas is freed', async () => {
    const o = setup()
    o.tools.setLabels({ vertex: 'V', edge: 'E', length: (mm) => `L${mm.toFixed(2)}`, plane: () => 'P' })
    o.tools.measure.start('mouse', false)
    o.tap(...o.at(0.4, 0.3, 0.3))
    o.tap(...o.at(0.3, 0.3, 0.4))
    const label = `L${o.measured().list[0]!.distance.toFixed(2)}`
    const withMarks = await shoot(o, { background: 'canvas', scale: 2, pins: true, measures: true })
    expect(withMarks.blob).toBeInstanceOf(Blob)
    expect(withMarks.draw.calls('drawImage')[0]![0]).toBe(o.host.renderer.domElement)
    expect(withMarks.draw.calls('fillText').map((args) => args[0])).toContain(label)
    expect(withMarks.captured!.width).toBe(0)
    expect(withMarks.captured!.height).toBe(0)
    vi.restoreAllMocks()
    const bare = await shoot(o, { background: 'canvas', scale: 1, pins: true, measures: false })
    // The image's own draw (the live overlay redraws the screen after it, with the marks, as before).
    const imageTexts = bare.draw.log.slice(0, bare.draw.log.findIndex(([key]) => key === 'restore') + 1).filter(([key]) => key === 'fillText')
    expect(imageTexts).toEqual([])
    o.scene.dispose()
  })

  it('a transparent image clears with alpha 0 and no grid; the screen gets both back', async () => {
    const o = setup()
    const grid = o.host.scene.children.find((child) => child.type === 'GridHelper')!
    const shownDuring: boolean[] = []
    const render = o.host.renderer.render as unknown as { mockImplementation: (f: () => void) => void }
    render.mockImplementation(() => void shownDuring.push(grid.visible))
    calls.clear.length = 0
    await shoot(o, { background: 'transparent', scale: 1, pins: true, measures: true })
    expect(calls.clear[0]![1]).toBe(0)
    expect(shownDuring[0]).toBe(false)
    expect(calls.clear.at(-1)![1]).toBe(1)
    expect(grid.visible).toBe(true)
    o.scene.dispose()
  })

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
