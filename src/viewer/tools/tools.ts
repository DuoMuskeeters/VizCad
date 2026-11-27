/**
 * The studio tools (docs/11 §4.3, Faz 5d): section plane with a stencil cap, point-to-point measure (vertex and edge
 * snapping with a mouse, hold-and-slide under a magnifier on touch), and the screenshot (B8). A lazy chunk: loaded the
 * first time a tool opens. It draws its marks on a 2D canvas over the WebGL one, right after each frame, so a
 * screenshot can draw the same marks again at its own size. Nothing here is saved (B4).
 */
import {
  AlwaysStencilFunc,
  BackSide,
  Box3,
  CanvasTexture,
  Color,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  type Intersection,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  type Object3D,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  ReplaceStencilOp,
  Vector3,
} from 'three'
import type { ToolHost } from '../scene/createScene'
import { worldBox } from '../scene/fit'
import { AXIS_INDEX, distanceOf, dragPosition, EDGE_SNAP_PX, sectionAt, sectionPlane, shotRatio, snapOnTriangle, VERTEX_SNAP_PX, type Screen } from './math'
import type { Axis, MeasureMode, MeasurePoint, MeasureState, Measurement, ScreenshotOptions, SectionSettings, ToolLabels, ToolsApi, Vec3 } from './types'

const ACCENT = '#22c3e0'
const MUTED = '#9aa4b2'
const INK = '#0b1017'
const PAPER = '#e6e9ee'
const CAP = '#c7d0db'
const HATCH = '#566271'
/** A press held this long without moving starts aiming under the magnifier (touch). */
const HOLD_MS = 240
const LOUPE_RADIUS = 56
const LOUPE_ZOOM = 2.5
const LOUPE_LIFT = 92
const HANDLE_RADIUS = 22

const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z]

const hatchTexture = () => {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    ctx.fillStyle = CAP
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = HATCH
    ctx.lineWidth = 3
    // Three strokes so the 45° lines run on across tile borders.
    for (const offset of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(offset, size)
      ctx.lineTo(offset + size, 0)
      ctx.stroke()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

const fontFamily = () => getComputedStyle(document.body).fontFamily || 'sans-serif'

export const createTools = (host: ToolHost): ToolsApi => {
  const { renderer, scene, camera, canvas, container, controls } = host
  let labels: ToolLabels = {
    vertex: 'Vertex',
    edge: 'Edge',
    length: (mm) => `${mm.toFixed(1)} mm`,
    plane: (axis, mm) => `${axis.toUpperCase()} = ${mm.toFixed(0)} mm`,
  }

  // The overlay: a 2D canvas over the WebGL one, never in the way of the pointer.
  const overlay = document.createElement('canvas')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.className = 'pointer-events-none absolute inset-0 size-full'
  container.appendChild(overlay)

  /** CSS px of a world point on the canvas, or null behind the camera. */
  const toScreen = (p: Vec3 | Vector3, width = canvas.clientWidth, height = canvas.clientHeight): Screen | null => {
    const v = Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : (p as Vector3).clone()
    v.project(camera)
    if (v.z > 1 || v.z < -1) return null
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height]
  }

  // ---------------------------------------------------------------- section
  let section: SectionSettings | null = null
  let box: Box3 | null = null
  const plane = new Plane()
  const dragListeners = new Set<(position: number) => void>()
  const backFaces = new MeshBasicMaterial({
    side: BackSide, colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilFunc: AlwaysStencilFunc, stencilFail: IncrementWrapStencilOp, stencilZFail: IncrementWrapStencilOp, stencilZPass: IncrementWrapStencilOp,
  })
  const frontFaces = new MeshBasicMaterial({
    side: FrontSide, colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilFunc: AlwaysStencilFunc, stencilFail: DecrementWrapStencilOp, stencilZFail: DecrementWrapStencilOp, stencilZPass: DecrementWrapStencilOp,
  })
  const hatch = hatchTexture()
  const capMaterial = new MeshBasicMaterial({
    color: new Color(CAP), side: DoubleSide,
    stencilWrite: true, stencilRef: 0, stencilFunc: NotEqualStencilFunc, stencilFail: ReplaceStencilOp, stencilZFail: ReplaceStencilOp, stencilZPass: ReplaceStencilOp,
  })
  const capGeometry = new PlaneGeometry(1, 1)
  const cap = new Mesh(capGeometry, capMaterial)
  cap.renderOrder = 2
  cap.visible = false
  scene.add(cap)
  // One stencil pair per model mesh, kept in step with it before each frame (visibility, place). Not children of the
  // model, so STL export, edges and wireframe never see them.
  let stencils: Array<{ source: Mesh; back: Mesh; front: Mesh }> = []
  const shownInScene = (object: Object3D) => {
    for (let at: Object3D | null = object; at !== null; at = at.parent) if (!at.visible) return false
    return true
  }
  const syncStencils = () => {
    for (const { source, back, front } of stencils) {
      const visible = section !== null && shownInScene(source)
      back.visible = visible
      front.visible = visible
      if (!visible) continue
      back.matrixWorld.copy(source.matrixWorld)
      front.matrixWorld.copy(source.matrixWorld)
    }
  }
  const clearStencils = () => {
    for (const { back, front } of stencils) {
      back.removeFromParent()
      front.removeFromParent()
    }
    stencils = []
  }
  const buildStencils = () => {
    clearStencils()
    const model = host.model()
    if (model === null) return
    model.traverse((object) => {
      if (!(object as Mesh).isMesh) return
      const source = object as Mesh
      const make = (material: MeshBasicMaterial) => {
        const mesh = new Mesh(source.geometry, material)
        mesh.matrixAutoUpdate = false
        mesh.matrixWorldAutoUpdate = false
        mesh.renderOrder = 1
        scene.add(mesh)
        return mesh
      }
      stencils.push({ source, back: make(backFaces), front: make(frontFaces) })
    })
  }
  const previousBefore = scene.onBeforeRender
  scene.onBeforeRender = (...args) => {
    previousBefore.apply(scene, args)
    if (section !== null) syncStencils()
  }

  const rangeOf = (axis: Axis) => {
    if (box === null || box.isEmpty()) return null
    const i = AXIS_INDEX[axis]
    return { min: box.min.getComponent(i), max: box.max.getComponent(i) }
  }
  /** Where the handle sits: the box centre, moved onto the plane. */
  const handlePoint = () => {
    if (section === null || box === null) return null
    const range = rangeOf(section.axis)
    if (range === null) return null
    const point = box.getCenter(new Vector3())
    point.setComponent(AXIS_INDEX[section.axis], sectionAt(range, section.position))
    return point
  }
  const applySection = () => {
    const studio = host.studio()
    if (section === null || box === null) {
      renderer.clippingPlanes = []
      studio?.setClip([])
      cap.visible = false
      host.setGrid(true)
      for (const { back, front } of stencils) back.visible = front.visible = false
      host.redraw()
      return
    }
    const range = rangeOf(section.axis)!
    const { normal, constant } = sectionPlane(section, range)
    plane.normal.set(normal[0], normal[1], normal[2])
    plane.constant = constant
    renderer.clippingPlanes = [plane]
    studio?.setClip([plane])
    // The cap: a square on the plane, a hair to the kept side so the plane does not clip it, big enough for any view.
    const size = box.getSize(new Vector3()).length() * 2 || 1
    const center = handlePoint()!
    cap.position.copy(center).addScaledVector(plane.normal, size * 1e-5)
    cap.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), plane.normal)
    cap.scale.set(size, size, 1)
    capMaterial.map = section.hatch ? hatch : null
    capMaterial.color.set(section.hatch ? '#ffffff' : CAP)
    capMaterial.needsUpdate = true
    // About 60 hatch tiles across the cap (twice the model's diagonal): lines a few pixels apart at a fitted zoom.
    hatch.repeat.set(60, 60)
    cap.visible = true
    // The grid would be cut in half; the cut model reads better without it.
    host.setGrid(false)
    host.redraw()
  }

  // ---------------------------------------------------------------- measure
  let measures: Measurement[] = []
  let pending: MeasurePoint | null = null
  let nextId = 1
  let mode: MeasureMode | null = null
  let single = false
  let hover: MeasurePoint | null = null
  let aiming: { x: number; y: number; point: MeasurePoint | null } | null = null
  const measureListeners = new Set<(state: MeasureState) => void>()
  const emit = () => {
    const state: MeasureState = { list: measures, pending }
    measureListeners.forEach((listener) => listener(state))
  }
  const raycaster = new Raycaster()

  /** The point under the pointer with its snap (a vertex or an edge of the hit triangle, else the surface). */
  const pointAt = (clientX: number, clientY: number, finger: boolean): MeasurePoint | null => {
    const studio = host.studio()
    if (studio === null || !host.aim(raycaster, clientX, clientY)) return null
    const found = studio.hit(raycaster)
    if (found === null) return null
    return snapped(found.hit, found.path, clientX, clientY, finger)
  }
  const snapped = (hit: Intersection<Mesh>, path: string, clientX: number, clientY: number, finger: boolean): MeasurePoint => {
    const surface: MeasurePoint = { point: vec(hit.point), path, snap: 'surface' }
    const face = hit.face
    const position = hit.object.geometry.getAttribute('position')
    if (!face || position === undefined) return surface
    const corners = [face.a, face.b, face.c].map((i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(hit.object.matrixWorld))
    const rect = canvas.getBoundingClientRect()
    const onScreen = corners.map((c) => toScreen(c))
    if (onScreen.some((s) => s === null)) return surface
    const pointer: Screen = [clientX - rect.left, clientY - rect.top]
    const scale = finger ? 1.6 : 1
    const snap = snapOnTriangle(pointer, onScreen as [Screen, Screen, Screen], VERTEX_SNAP_PX * scale, EDGE_SNAP_PX * scale)
    if (snap.snap === 'vertex') return { point: vec(corners[snap.corner]!), path, snap: 'vertex' }
    if (snap.snap === 'edge') return { point: vec(corners[snap.from]!.clone().lerp(corners[snap.to]!, snap.t)), path, snap: 'edge' }
    return surface
  }
  const place = (point: MeasurePoint) => {
    if (pending === null) {
      pending = point
      if (single) measures = []
    } else {
      const a = pending
      measures = [...(single ? [] : measures), { id: nextId++, a, b: point, distance: distanceOf(a.point, point.point), delta: [point.point[0] - a.point[0], point.point[1] - a.point[1], point.point[2] - a.point[2]] }]
      pending = null
    }
    emit()
    host.redraw()
  }

  // Pointer handling while measuring. Capture listeners run before OrbitControls' own on the same canvas.
  let hold: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null
  let justAimed = false
  let hoverFrame = 0
  const onDown = (event: PointerEvent) => {
    justAimed = false
    if (section?.handle && event.button === 0 && grabHandle(event)) return
    if (mode !== 'touch' || event.pointerType !== 'touch' || !event.isPrimary) {
      if (hold !== null) cancelHold()
      return
    }
    const id = event.pointerId
    const x = event.clientX
    const y = event.clientY
    hold = {
      id, x, y,
      timer: setTimeout(() => {
        hold = null
        // Aiming: the orbit stops until the finger lifts; the magnifier shows what the finger covers.
        controls.enabled = false
        aiming = { x, y, point: pointAt(x, y, true) }
        host.redraw()
      }, HOLD_MS),
    }
  }
  const cancelHold = () => {
    if (hold !== null) clearTimeout(hold.timer)
    hold = null
  }
  const onMove = (event: PointerEvent) => {
    if (drag !== null) return moveHandle(event)
    if (hold !== null && event.pointerId === hold.id && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold()
    if (aiming !== null) {
      aiming = { x: event.clientX, y: event.clientY, point: pointAt(event.clientX, event.clientY, true) }
      host.redraw()
      return
    }
    if (mode === 'mouse' && event.pointerType !== 'touch' && event.buttons === 0) {
      const { clientX, clientY } = event
      cancelAnimationFrame(hoverFrame)
      hoverFrame = requestAnimationFrame(() => {
        hover = pointAt(clientX, clientY, false)
        host.redraw()
      })
    }
    if (section?.handle && event.buttons === 0) canvas.classList.toggle('cursor-ew-resize!', overHandle(event))
  }
  const onUp = (event: PointerEvent) => {
    if (drag !== null) return endHandle(event)
    cancelHold()
    if (aiming === null) return
    const point = aiming.point
    aiming = null
    justAimed = true
    controls.enabled = true
    if (point !== null) place(point)
    else host.redraw()
  }
  const onLeave = () => {
    if (hover === null) return
    hover = null
    host.redraw()
  }
  canvas.addEventListener('pointerdown', onDown, { capture: true })
  canvas.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { capture: true })
  window.addEventListener('pointercancel', onUp, { capture: true })
  canvas.addEventListener('pointerleave', onLeave)

  // ---------------------------------------------------------------- section handle (desktop)
  let drag: { id: number; x: number; y: number; position: number } | null = null
  const overHandle = (event: PointerEvent) => {
    const at = handlePoint()
    const screen = at === null ? null : toScreen(at)
    if (screen === null) return false
    const rect = canvas.getBoundingClientRect()
    return Math.hypot(event.clientX - rect.left - screen[0], event.clientY - rect.top - screen[1]) <= HANDLE_RADIUS
  }
  const grabHandle = (event: PointerEvent) => {
    if (section === null || !overHandle(event)) return false
    // The handle, not the orbit: OrbitControls never hears this press.
    event.stopImmediatePropagation()
    canvas.setPointerCapture(event.pointerId)
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, position: section.position }
    return true
  }
  const moveHandle = (event: PointerEvent) => {
    if (drag === null || section === null || event.pointerId !== drag.id) return
    const range = rangeOf(section.axis)
    const at = handlePoint()
    if (range === null || at === null) return
    const step = at.clone()
    step.setComponent(AXIS_INDEX[section.axis], step.getComponent(AXIS_INDEX[section.axis]) + 1)
    const a = toScreen(at)
    const b = toScreen(step)
    if (a === null || b === null) return
    const position = dragPosition(drag.position, range, [event.clientX - drag.x, event.clientY - drag.y], [b[0] - a[0], b[1] - a[1]])
    if (position === section.position) return
    section = { ...section, position }
    applySection()
    dragListeners.forEach((listener) => listener(position))
  }
  const endHandle = (event: PointerEvent) => {
    if (drag === null || event.pointerId !== drag.id) return
    drag = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  // ---------------------------------------------------------------- drawing
  const drawMarks = (ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, withMeasures: boolean, live: boolean) => {
    const font = fontFamily()
    const project = (p: Vec3) => toScreen(p, width / scale, height / scale)
    const dot = (s: Screen, color: string, r = 5) => {
      ctx.beginPath()
      ctx.arc(s[0], s[1], r, 0, Math.PI * 2)
      ctx.fillStyle = INK
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = color
      ctx.stroke()
    }
    const tag = (text: string, x: number, y: number, color: string) => {
      ctx.font = `600 12px ${font}`
      const w = ctx.measureText(text).width + 14
      const h = 22
      const left = Math.max(2, Math.min(width / scale - w - 2, x - w / 2))
      const top = Math.max(2, Math.min(height / scale - h - 2, y - h / 2))
      ctx.fillStyle = INK
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(left, top, w, h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = PAPER
      ctx.textBaseline = 'middle'
      ctx.fillText(text, left + 7, top + h / 2 + 0.5)
    }
    ctx.save()
    ctx.scale(scale, scale)
    if (withMeasures) {
      measures.forEach((m, i) => {
        const a = project(m.a.point)
        const b = project(m.b.point)
        if (a === null || b === null) return
        const color = i === measures.length - 1 ? ACCENT : MUTED
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
        ctx.setLineDash([])
        dot(a, color)
        dot(b, color)
        tag(labels.length(m.distance), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 18, color)
      })
      if (pending !== null) {
        const a = project(pending.point)
        if (a !== null) dot(a, ACCENT)
      }
    }
    if (live) {
      // Snap mark under the mouse: a ring on a vertex, a square on an edge.
      if (hover !== null && mode === 'mouse') {
        const s = project(hover.point)
        if (s !== null) {
          ctx.strokeStyle = ACCENT
          ctx.lineWidth = 2
          ctx.beginPath()
          if (hover.snap === 'vertex') ctx.arc(s[0], s[1], 8, 0, Math.PI * 2)
          else if (hover.snap === 'edge') ctx.rect(s[0] - 6, s[1] - 6, 12, 12)
          else ctx.arc(s[0], s[1], 3, 0, Math.PI * 2)
          ctx.stroke()
          if (pending !== null) {
            const a = project(pending.point)
            if (a !== null) {
              ctx.setLineDash([4, 4])
              ctx.beginPath()
              ctx.moveTo(a[0], a[1])
              ctx.lineTo(s[0], s[1])
              ctx.stroke()
              ctx.setLineDash([])
              tag(labels.length(distanceOf(pending.point, hover.point)), (a[0] + s[0]) / 2, (a[1] + s[1]) / 2 - 18, ACCENT)
            }
          }
          if (hover.snap !== 'surface') tag(hover.snap === 'vertex' ? labels.vertex : labels.edge, s[0] + 40, s[1] - 22, ACCENT)
        }
      }
      // The section handle and its tag.
      if (section?.handle) {
        const at = handlePoint()
        const s = at === null ? null : project(vec(at))
        const range = section === null ? null : rangeOf(section.axis)
        if (s !== null && range !== null) {
          ctx.beginPath()
          ctx.arc(s[0], s[1], HANDLE_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = INK
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = ACCENT
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(s[0] - 8, s[1])
          ctx.lineTo(s[0] + 8, s[1])
          ctx.moveTo(s[0] - 5, s[1] - 3)
          ctx.lineTo(s[0] - 8, s[1])
          ctx.lineTo(s[0] - 5, s[1] + 3)
          ctx.moveTo(s[0] + 5, s[1] - 3)
          ctx.lineTo(s[0] + 8, s[1])
          ctx.lineTo(s[0] + 5, s[1] + 3)
          ctx.stroke()
          tag(labels.plane(section.axis, sectionAt(range, section.position)), s[0], s[1] - HANDLE_RADIUS - 16, ACCENT)
        }
      }
    }
    ctx.restore()
  }

  /** The magnifier over a holding finger: the WebGL canvas around the finger, enlarged, lifted above it. */
  const drawLoupe = (ctx: CanvasRenderingContext2D, ratio: number) => {
    if (aiming === null) return
    const rect = canvas.getBoundingClientRect()
    const x = aiming.x - rect.left
    const y = aiming.y - rect.top
    const cx = Math.max(LOUPE_RADIUS + 4, Math.min(rect.width - LOUPE_RADIUS - 4, x))
    const cy = y - LOUPE_LIFT < LOUPE_RADIUS + 4 ? y + LOUPE_LIFT : y - LOUPE_LIFT
    const source = (LOUPE_RADIUS / LOUPE_ZOOM) * ratio
    ctx.save()
    ctx.scale(ratio, ratio)
    ctx.beginPath()
    ctx.arc(cx, cy, LOUPE_RADIUS, 0, Math.PI * 2)
    ctx.save()
    ctx.clip()
    ctx.fillStyle = INK
    ctx.fill()
    ctx.drawImage(renderer.domElement, x * ratio - source, y * ratio - source, source * 2, source * 2, cx - LOUPE_RADIUS, cy - LOUPE_RADIUS, LOUPE_RADIUS * 2, LOUPE_RADIUS * 2)
    ctx.restore()
    ctx.lineWidth = 2
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    // Crosshair: the point that will be placed. Where it snapped is drawn as a ring.
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy)
    ctx.lineTo(cx + 10, cy)
    ctx.moveTo(cx, cy - 10)
    ctx.lineTo(cx, cy + 10)
    ctx.strokeStyle = PAPER
    ctx.lineWidth = 1.5
    ctx.stroke()
    if (aiming.point !== null && aiming.point.snap !== 'surface') {
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.strokeStyle = ACCENT
      ctx.stroke()
    }
    ctx.restore()
  }

  const drawOverlay = () => {
    const ratio = renderer.getPixelRatio()
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width
      overlay.height = height
    }
    const ctx = overlay.getContext('2d')
    if (ctx === null) return
    ctx.clearRect(0, 0, width, height)
    drawMarks(ctx, width, height, ratio, true, true)
    drawLoupe(ctx, ratio)
  }
  const offFrame = host.onFrame(drawOverlay)

  const offModel = host.onModel(() => {
    const model = host.model()
    box = model === null ? null : worldBox(model)
    measures = []
    pending = null
    hover = null
    emit()
    buildStencils()
    applySection()
  })
  {
    const model = host.model()
    box = model === null ? null : worldBox(model)
    buildStencils()
  }

  const clickHandler = (ray: Raycaster, event: PointerEvent) => {
    if (justAimed) {
      justAimed = false
      return
    }
    const studio = host.studio()
    if (studio === null) return
    const found = studio.hit(ray)
    if (found === null) return
    place(snapped(found.hit, found.path, event.clientX, event.clientY, event.pointerType === 'touch'))
  }

  return {
    section: {
      set: (next) => {
        section = next
        applySection()
      },
      range: rangeOf,
      onDrag: (listener) => {
        dragListeners.add(listener)
        return () => dragListeners.delete(listener)
      },
    },
    measure: {
      start: (next, one) => {
        mode = next
        single = one
        host.setClick(clickHandler)
        host.redraw()
      },
      stop: () => {
        mode = null
        hover = null
        pending = null
        aiming = null
        controls.enabled = true
        cancelHold()
        host.setClick(null)
        emit()
        host.redraw()
      },
      remove: (id) => {
        measures = measures.filter((m) => m.id !== id)
        emit()
        host.redraw()
      },
      clear: () => {
        measures = []
        pending = null
        emit()
        host.redraw()
      },
      subscribe: (listener) => {
        measureListeners.add(listener)
        listener({ list: measures, pending })
        return () => measureListeners.delete(listener)
      },
    },
    setLabels: (next) => {
      labels = next
      host.redraw()
    },
    screenshot: (options: ScreenshotOptions) =>
      new Promise((resolve) => {
        const width = Math.max(1, canvas.clientWidth)
        const height = Math.max(1, canvas.clientHeight)
        const screenRatio = renderer.getPixelRatio()
        const ratio = shotRatio(width, height, screenRatio, options.scale)
        const clear = renderer.getClearColor(new Color())
        const alpha = renderer.getClearAlpha()
        const keepHover = hover
        hover = null
        if (options.background !== 'canvas') host.setGrid(false)
        if (options.background === 'white') renderer.setClearColor(0xffffff, 1)
        if (options.background === 'transparent') renderer.setClearColor(clear, 0)
        renderer.setPixelRatio(ratio)
        renderer.setSize(width, height, false)
        // Read in the same task as the draw (no preserveDrawingBuffer): onto a 2D canvas with the marks on top.
        host.drawNow(false)
        const out = document.createElement('canvas')
        out.width = renderer.domElement.width
        out.height = renderer.domElement.height
        const ctx = out.getContext('2d')
        if (ctx !== null) {
          ctx.drawImage(renderer.domElement, 0, 0)
          drawMarks(ctx, out.width, out.height, ratio, options.measures, false)
        }
        renderer.setClearColor(clear, alpha)
        renderer.setPixelRatio(screenRatio)
        renderer.setSize(width, height, false)
        host.setGrid(section === null)
        hover = keepHover
        // Draw the screen again now, so no empty frame shows.
        host.drawNow(true)
        drawOverlay()
        if (ctx === null) return resolve(null)
        out.toBlob((blob) => resolve(blob), 'image/png')
      }),
    dispose: () => {
      offFrame()
      offModel()
      cancelHold()
      cancelAnimationFrame(hoverFrame)
      host.setClick(null)
      controls.enabled = true
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      canvas.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('pointercancel', onUp, { capture: true })
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.classList.remove('cursor-ew-resize!')
      scene.onBeforeRender = previousBefore
      section = null
      renderer.clippingPlanes = []
      host.studio()?.setClip([])
      host.setGrid(true)
      clearStencils()
      cap.removeFromParent()
      capGeometry.dispose()
      capMaterial.dispose()
      backFaces.dispose()
      frontFaces.dispose()
      hatch.dispose()
      overlay.remove()
      measureListeners.clear()
      dragListeners.clear()
      host.redraw()
    },
  }
}
