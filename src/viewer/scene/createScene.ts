/**
 * The viewer's three.js scene (docs/11 §1.1): renderer, camera, OrbitControls, lights, grid, ViewHelper. Lives in a
 * ref, never in React state. Renders on demand: a frame is drawn only when the camera moved or something changed.
 */
import {
  type BufferGeometry,
  Color,
  EdgesGeometry,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type Material,
  Vector3,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { EDGES_TRIANGLE_LIMIT } from '../state'
import type { Stats } from '../worker/protocol'
import { disposeObject } from './dispose'
import { fitCamera, MAX_ZOOM_OUT, worldBox, viewDirection, type ViewName } from './fit'
import { addLights, CANVAS_COLOR } from './lights'
import { createStudio, EMPTY_VIEW, type Studio, type StudioView } from './studio'
import type { OutlineNode } from '../tree/outline'

/** The axes gizmo is 128 px; on a narrow canvas it would cover the model. */
const GIZMO_MIN_WIDTH = 480

export type SceneHandle = {
  readonly setModel: (root: Object3D, stats: Stats) => void
  readonly fit: () => void
  readonly view: (name: ViewName) => void
  readonly setWireframe: (on: boolean) => void
  readonly setEdges: (on: boolean) => void
  readonly screenshot: () => Promise<Blob | null>
  /** The model's assembly outline (docs/11 §4), null before a model is set. */
  readonly outline: () => OutlineNode | null
  /** Visibility, isolate, selection and scene looks (`studio.ts`). */
  readonly setView: (view: StudioView) => void
  /** Fit the camera to this node (isolate) or to the whole model (null). */
  readonly focus: (path: string | null) => void
  /** World size of a node in model units, or null. */
  readonly sizeOf: (path: string) => readonly [number, number, number] | null
  /** A small image of one node on its own (folder view, docs/11 §4.1), drawn with this renderer while the canvas is hidden. */
  readonly thumbnail: (path: string, width: number, height: number) => Promise<Blob | null>
  /** The meshes of a node for an STL export (B7): the node's object, world transforms applied by the exporter. */
  readonly objectAt: (path: string) => Object3D | null
  /** Draw calls, geometries and textures still alive (dispose check, docs/11 §6). */
  readonly memory: () => { readonly geometries: number; readonly textures: number }
  readonly dispose: () => void
}

export class WebGlUnavailable extends Error {
  constructor() {
    super('WebGL is not available')
    this.name = 'WebGlUnavailable'
  }
}

const materialsOf = (root: Object3D) => {
  const out = new Set<Material>()
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const m = object.material as Material | Material[]
      if (Array.isArray(m)) m.forEach((x) => out.add(x))
      else out.add(m)
    }
  })
  return out
}

/**
 * Creates its own canvas inside `container` and removes it on dispose: a lost context (forceContextLoss frees GPU memory
 * at once, docs/11 §6) is never reused, also not by React's double mount in development.
 */
export type SceneOptions = {
  /** A click (not a drag) on the canvas: the picked part's node path, or null on empty space. */
  readonly onPick?: ((path: string | null) => void) | undefined
}

/** A press that moved less than this many pixels and lasted less than `CLICK_MS` is a click, not an orbit. */
const CLICK_SLOP = 5
const CLICK_MS = 500

export const createScene = (container: HTMLElement, label: string, options: SceneOptions = {}): SceneHandle => {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', label)
  canvas.className = 'block size-full touch-none select-none cursor-grab active:cursor-grabbing'
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch {
    throw new WebGlUnavailable()
  }
  container.appendChild(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.autoClear = false
  renderer.setClearColor(new Color(CANVAS_COLOR), 1)

  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 1e6)
  // Z-up world: set before OrbitControls reads it.
  camera.up.set(0, 0, 1)
  scene.add(camera)
  addLights(scene, camera)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.screenSpacePanning = true

  const gizmo = new ViewHelper(camera, canvas)
  gizmo.setLabels('X', 'Y', 'Z')
  gizmo.location.top = 8
  gizmo.location.right = 8

  let model: Object3D | null = null
  let studio: Studio | null = null
  let view: StudioView = EMPTY_VIEW
  let wireframe = false
  let focusPath: string | null = null
  let grid: GridHelper | null = null
  let edges: LineSegments[] = []
  let triangles = 0
  let dirty = true
  let frame = 0
  let disposed = false
  // A lost context (GPU reset, driver update, too many contexts) draws nothing; three restores its own state when the
  // browser gives the context back, and the next frame redraws everything from the geometry still held here.
  let lost = false
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
  }
  const onRestored = () => {
    lost = false
    dirty = true
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  // Picking (docs/11 §4.2): a short press without movement selects; any drag stays an orbit. One pointer only.
  const raycaster = new Raycaster()
  let press: { id: number; x: number; y: number; at: number } | null = null
  const onDown = (event: PointerEvent) => {
    press = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() } : null
  }
  const onUp = (event: PointerEvent) => {
    const start = press
    press = null
    if (start === null || start.id !== event.pointerId || options.onPick === undefined || studio === null) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP || performance.now() - start.at > CLICK_MS) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    raycaster.setFromCamera(new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera)
    options.onPick(studio.pick(raycaster))
  }
  const onCancel = () => {
    press = null
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)

  const render = (withGizmo = true) => {
    if (lost) return
    renderer.clear()
    renderer.render(scene, camera)
    if (withGizmo && canvas.clientWidth >= GIZMO_MIN_WIDTH) gizmo.render(renderer)
  }

  const loop = () => {
    frame = requestAnimationFrame(loop)
    // update() reports camera movement, including the damping tail after the pointer is released.
    const moved = controls.update()
    if ((moved || dirty) && !lost) {
      dirty = false
      render()
    }
  }
  frame = requestAnimationFrame(loop)

  const resize = () => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    dirty = true
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  const focusBox = () => {
    const box = focusPath === null ? null : studio?.boundsOf(focusPath)
    return box ?? worldBox(model!)
  }

  const place = (direction: ReturnType<typeof viewDirection>) => {
    if (model === null) return
    const box = focusBox()
    const distance = fitCamera(camera, box, direction)
    controls.target.copy(box.getCenter(new Vector3()))
    controls.maxDistance = distance * MAX_ZOOM_OUT
    controls.update()
    dirty = true
  }

  const clearEdges = () => {
    const geometries = new Set(edges.map((line) => line.geometry))
    const materials = new Set(edges.map((line) => line.material as Material))
    for (const line of edges) line.removeFromParent()
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    edges = []
  }

  return {
    setModel: (root, stats) => {
      studio?.dispose()
      if (model !== null) disposeObject(model)
      clearEdges()
      grid?.removeFromParent()
      grid?.dispose()
      model = root
      triangles = stats.triangles
      studio = createStudio(root)
      focusPath = null
      if (view !== EMPTY_VIEW) studio.apply(view)
      scene.add(root)
      // Grid under the model in world space (the root may be turned for a Y-up source), sized in round steps.
      const box = worldBox(root)
      const center = box.getCenter(new Vector3())
      const extent = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 1e-3)
      const step = 10 ** Math.floor(Math.log10(extent / 2))
      const size = Math.ceil((extent * 2.5) / step) * step
      grid = new GridHelper(size, Math.min(200, Math.round(size / step)), 0x3a4656, 0x283240)
      grid.rotation.x = Math.PI / 2
      grid.position.set(center.x, center.y, box.min.z)
      scene.add(grid)
      place(viewDirection('iso'))
    },
    fit: () => {
      const direction = camera.position.clone().sub(controls.target)
      place(direction.lengthSq() > 0 ? direction : viewDirection('iso'))
    },
    view: (name) => place(viewDirection(name)),
    setWireframe: (on) => {
      wireframe = on
      if (model === null) return
      for (const m of materialsOf(model)) if ('wireframe' in m) (m as Material & { wireframe: boolean }).wireframe = on
      dirty = true
    },
    setEdges: (on) => {
      if (model === null) return
      if (!on) {
        for (const line of edges) line.visible = false
        dirty = true
        return
      }
      if (triangles > EDGES_TRIANGLE_LIMIT) return
      if (edges.length === 0) {
        const meshes: Mesh[] = []
        model.traverse((object) => {
          if (object instanceof Mesh) meshes.push(object)
        })
        const material = new LineBasicMaterial({ color: 0x0e141c })
        // Instances share their geometry, so they share its edges too.
        const byGeometry = new Map<BufferGeometry, EdgesGeometry>()
        for (const mesh of meshes) {
          let geometry = byGeometry.get(mesh.geometry)
          if (geometry === undefined) {
            geometry = new EdgesGeometry(mesh.geometry, 30)
            byGeometry.set(mesh.geometry, geometry)
          }
          const line = new LineSegments(geometry, material)
          mesh.add(line)
          edges.push(line)
        }
      }
      for (const line of edges) line.visible = true
      dirty = true
    },
    screenshot: () =>
      new Promise((resolve) => {
        // Without preserveDrawingBuffer the image must be read in the same task as the draw.
        render(false)
        canvas.toBlob((blob) => resolve(blob), 'image/png')
        dirty = true
      }),
    outline: () => studio?.outline ?? null,
    setView: (next) => {
      view = next
      if (studio === null || model === null) return
      studio.apply(next)
      // Materials the studio swapped in follow the wireframe toggle too.
      if (wireframe) for (const m of materialsOf(model)) if ('wireframe' in m) (m as Material & { wireframe: boolean }).wireframe = true
      dirty = true
    },
    focus: (path) => {
      focusPath = path
      const direction = camera.position.clone().sub(controls.target)
      place(direction.lengthSq() > 0 ? direction : viewDirection('iso'))
    },
    sizeOf: (path) => {
      const box = studio?.boundsOf(path)
      if (!box) return null
      // The world is Z-up in model units; a Y-up source was turned at the root, so the box is already in file axes.
      return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
    },
    objectAt: (path) => studio?.objectAt(path) ?? null,
    thumbnail: (path, width, height) =>
      new Promise((resolve) => {
        const target = studio?.objectAt(path)
        if (lost || model === null || studio === null || !target) return resolve(null)
        const box = studio.boundsOf(path)
        if (box === null) return resolve(null)
        // Only the node: layer 1 for it, its ancestors (transforms) and the lights; forced visible while drawn.
        const shown: Array<[Object3D, boolean]> = []
        const mark = (object: Object3D) => {
          shown.push([object, object.visible])
          object.visible = true
          object.layers.enable(1)
        }
        target.traverse(mark)
        for (let at = target.parent; at !== null; at = at.parent) mark(at)
        // The headlight rides on the camera, which is in the scene: one traversal finds every light.
        const lights: Object3D[] = []
        scene.traverse((object) => {
          if ((object as { isLight?: boolean }).isLight) lights.push(object)
        })
        lights.forEach((light) => light.layers.enable(1))
        const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), near: camera.near, far: camera.far, aspect: camera.aspect }
        const ratio = renderer.getPixelRatio()
        renderer.setPixelRatio(1)
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.layers.set(1)
        fitCamera(camera, box, viewDirection('iso'), 1.04)
        renderer.clear()
        renderer.render(scene, camera)
        // Read in the same task as the draw (no preserveDrawingBuffer).
        canvas.toBlob((blob) => resolve(blob), 'image/png')
        camera.layers.set(0)
        lights.forEach((light) => light.layers.disable(1))
        for (const [object, visible] of shown) {
          object.visible = visible
          object.layers.disable(1)
        }
        camera.position.copy(saved.position)
        camera.quaternion.copy(saved.quaternion)
        camera.near = saved.near
        camera.far = saved.far
        renderer.setPixelRatio(ratio)
        resize()
      }),
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      observer.disconnect()
      controls.dispose()
      gizmo.dispose()
      clearEdges()
      studio?.dispose()
      studio = null
      if (model !== null) disposeObject(model)
      grid?.dispose()
      renderer.renderLists.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
