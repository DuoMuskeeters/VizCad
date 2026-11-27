// @vitest-environment jsdom
import { BufferGeometry, Material, Mesh } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normaliseTree } from '../tree/tree'
import type { MeshData, ParsedModel, Stats } from '../worker/protocol'
import { buildModel } from './build'

// jsdom has no WebGL: a stub renderer records what the scene asks of it (docs/11 §6 dispose check).
const renderers = vi.hoisted(() => [] as Array<{ render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn>; lists: ReturnType<typeof vi.fn> }>)
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  class StubRenderer {
    autoClear = true
    info = { memory: { geometries: 0, textures: 0 } }
    render = vi.fn()
    dispose = vi.fn()
    forceContextLoss = vi.fn()
    renderLists = { dispose: vi.fn() }
    constructor() {
      renderers.push({ render: this.render, dispose: this.dispose, forceContextLoss: this.forceContextLoss, lists: this.renderLists.dispose })
    }
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
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

const { createScene } = await import('./createScene')

const stats: Stats = { triangles: 2, nodes: 3, parts: 2, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }
const mesh = (name: string): MeshData => ({
  name, color: null, position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), normal: null, index: new Uint32Array([0, 1, 2, 0, 1, 3]), vertexColor: null, groups: [],
})
const model = (): ParsedModel => {
  const meshes = [mesh('A'), mesh('B')]
  return { meshes, tree: normaliseTree({ name: 'm', meshes: [0, 1, 1], children: [] }, meshes), up: 'z' }
}

/** Counts `dispose` events per geometry and material of a built model. */
const watchDisposal = (root: ReturnType<typeof buildModel>) => {
  const counts = new Map<BufferGeometry | Material, number>()
  root.traverse((object) => {
    const drawable = object as { geometry?: BufferGeometry; material?: Material | Material[] }
    for (const item of [drawable.geometry, ...[drawable.material].flat()])
      if (item && !counts.has(item)) {
        counts.set(item, 0)
        item.addEventListener('dispose', () => counts.set(item, (counts.get(item) ?? 0) + 1))
      }
  })
  return counts
}

let frames: FrameRequestCallback[] = []
const nextFrame = () => {
  const due = frames
  frames = []
  due.forEach((callback) => callback(0))
}

beforeEach(() => {
  renderers.length = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  const disconnected = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect = disconnected
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('createScene', () => {
  it('frees every geometry and material once: on a model swap and on dispose; the canvas and context go too', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const scene = createScene(container, 'label')
    expect(container.querySelectorAll('canvas')).toHaveLength(1)

    const first = buildModel(model())
    const firstCounts = watchDisposal(first)
    scene.setModel(first, stats)
    // Two meshes, one shared by two nodes: two geometries, one material.
    expect(firstCounts.size).toBe(3)
    const second = buildModel(model())
    const secondCounts = watchDisposal(second)
    scene.setModel(second, stats)
    expect([...firstCounts.values()]).toEqual([1, 1, 1])
    expect([...secondCounts.values()]).toEqual([0, 0, 0])
    scene.setEdges(true)

    scene.dispose()
    scene.dispose()
    expect([...secondCounts.values()]).toEqual([1, 1, 1])
    const [renderer] = renderers
    expect(renderer!.dispose).toHaveBeenCalledTimes(1)
    expect(renderer!.forceContextLoss).toHaveBeenCalledTimes(1)
    expect(renderer!.lists).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('canvas')).toHaveLength(0)
    expect(frames).toEqual([])
  })

  it('draws nothing while the context is lost and redraws when it comes back', () => {
    const container = document.createElement('div')
    const scene = createScene(container, 'label')
    const canvas = container.querySelector('canvas')!
    const renderer = renderers[0]!
    nextFrame()
    expect(renderer.render).toHaveBeenCalled()
    renderer.render.mockClear()

    const lost = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(lost)
    expect(lost.defaultPrevented).toBe(true)
    scene.fit()
    scene.setModel(buildModel(model()), stats)
    nextFrame()
    nextFrame()
    expect(renderer.render).not.toHaveBeenCalled()

    canvas.dispatchEvent(new Event('webglcontextrestored'))
    nextFrame()
    expect(renderer.render).toHaveBeenCalled()
    scene.dispose()
    // Listeners are gone with the scene.
    renderer.render.mockClear()
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    nextFrame()
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('turns wireframe off on every material the studio swapped in, cached highlight clones too', () => {
    const scene = createScene(document.createElement('div'), 'label')
    const root = buildModel(model())
    scene.setModel(root, stats)
    const meshes: Mesh[] = []
    root.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object)
    })
    const wire = () => meshes.map((m) => (m.material as Material & { wireframe: boolean }).wireframe)
    const selected = { selected: '0', isolated: null, hidden: new Set<string>(), looks: new Map() }
    const cleared = { ...selected, selected: null }
    scene.setWireframe(true)
    scene.setView(selected)
    expect(wire().every(Boolean)).toBe(true)
    scene.setWireframe(false)
    scene.setView(cleared)
    expect(wire().some(Boolean)).toBe(false)
    // The highlight clones made while wireframe was on come back without it.
    scene.setView(selected)
    expect(wire().some(Boolean)).toBe(false)
    scene.dispose()
  })
})
