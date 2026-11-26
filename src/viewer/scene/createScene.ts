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
  Scene,
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

/** The axes gizmo is 128 px; on a narrow canvas it would cover the model. */
const GIZMO_MIN_WIDTH = 480

export type SceneHandle = {
  readonly setModel: (root: Object3D, stats: Stats) => void
  readonly fit: () => void
  readonly view: (name: ViewName) => void
  readonly setWireframe: (on: boolean) => void
  readonly setEdges: (on: boolean) => void
  readonly screenshot: () => Promise<Blob | null>
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
export const createScene = (container: HTMLElement, label: string): SceneHandle => {
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

  const place = (direction: ReturnType<typeof viewDirection>) => {
    if (model === null) return
    const box = worldBox(model)
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
      if (model !== null) disposeObject(model)
      clearEdges()
      grid?.removeFromParent()
      grid?.dispose()
      model = root
      triangles = stats.triangles
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
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      observer.disconnect()
      controls.dispose()
      gizmo.dispose()
      clearEdges()
      if (model !== null) disposeObject(model)
      grid?.dispose()
      renderer.renderLists.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
