/**
 * The tools' arithmetic without three.js objects (tested on its own): where a measure point snaps on screen, the
 * section plane for a setting, the handle drag along the axis, the screenshot size.
 */
import type { Axis, SectionRange, SectionSettings, Vec3 } from './types'

export type Screen = readonly [number, number]

/** A vertex within this many CSS pixels of the pointer is taken (a finger gets more). */
export const VERTEX_SNAP_PX = 10
export const EDGE_SNAP_PX = 6

const closestOnSegment = (p: Screen, a: Screen, b: Screen): { t: number; d: number } => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len))
  return { t, d: Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) }
}

/**
 * The snap for a pointer over a triangle: its nearest corner within `vertexPx`, else the nearest point on an edge within
 * `edgePx` (as a 0–1 place between two corners), else the surface point itself. Corners are given on screen.
 */
export const snapOnTriangle = (
  pointer: Screen,
  corners: readonly [Screen, Screen, Screen],
  vertexPx = VERTEX_SNAP_PX,
  edgePx = EDGE_SNAP_PX,
  /** A corner that may be taken (not cut away by a section). */
  cornerOk: (corner: 0 | 1 | 2) => boolean = () => true,
  /** An edge that may be taken: a real edge of the shape (not a face's diagonal), its point not cut away. */
  edgeOk: (from: 0 | 1 | 2, to: 0 | 1 | 2) => boolean = () => true,
): { snap: 'vertex'; corner: 0 | 1 | 2 } | { snap: 'edge'; from: 0 | 1 | 2; to: 0 | 1 | 2; t: number } | { snap: 'surface' } => {
  let best = -1
  let bestD = Infinity
  corners.forEach((c, i) => {
    const d = Math.hypot(c[0] - pointer[0], c[1] - pointer[1])
    if (d < bestD && cornerOk(i as 0 | 1 | 2)) {
      bestD = d
      best = i
    }
  })
  if (bestD <= vertexPx) return { snap: 'vertex', corner: best as 0 | 1 | 2 }
  let edge: { from: 0 | 1 | 2; to: 0 | 1 | 2; t: number; d: number } | null = null
  for (const [from, to] of [[0, 1], [1, 2], [2, 0]] as const) {
    const at = closestOnSegment(pointer, corners[from], corners[to])
    if (at.d <= edgePx && (edge === null || at.d < edge.d) && edgeOk(from, to)) edge = { from, to, t: at.t, d: at.d }
  }
  return edge === null ? { snap: 'surface' } : { snap: 'edge', from: edge.from, to: edge.to, t: edge.t }
}

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** The place along the axis in model units for a 0–1 position. */
export const sectionAt = (range: SectionRange, position: number) => range.min + Math.max(0, Math.min(1, position)) * (range.max - range.min)

/**
 * The clipping plane (three's convention: what has a negative distance is cut away) as a normal and a constant.
 * Not flipped: the normal points down the axis, so the side above the plane goes.
 */
export const sectionPlane = (settings: Pick<SectionSettings, 'axis' | 'position' | 'flipped'>, range: SectionRange): { normal: Vec3; constant: number } => {
  const at = sectionAt(range, settings.position)
  const sign = settings.flipped ? 1 : -1
  const normal: [number, number, number] = [0, 0, 0]
  normal[AXIS_INDEX[settings.axis]] = sign
  return { normal, constant: -sign * at }
}

/**
 * A handle drag as a new 0–1 position: the pointer's movement projected on the axis as drawn on screen. `axisOnScreen`
 * is how far one model unit along the axis moves on screen (CSS px); a nearly end-on axis does not move the plane.
 */
export const dragPosition = (position: number, range: SectionRange, moved: Screen, axisOnScreen: Screen): number => {
  const len = axisOnScreen[0] * axisOnScreen[0] + axisOnScreen[1] * axisOnScreen[1]
  const span = range.max - range.min
  if (len < 1e-6 || !(span > 0)) return position
  const units = (moved[0] * axisOnScreen[0] + moved[1] * axisOnScreen[1]) / len
  return Math.max(0, Math.min(1, position + units / span))
}

/** Largest side of a screenshot in pixels: beyond this many GPUs refuse the drawing buffer. */
export const MAX_SHOT_PX = 4096

/** Pixel ratio of a screenshot: the screen's (B8 "screen") or twice it ("2×"), within `MAX_SHOT_PX`. */
export const shotRatio = (width: number, height: number, screenRatio: number, scale: 1 | 2) => {
  const wanted = screenRatio * scale
  const side = Math.max(1, width, height)
  return Math.max(0.25, Math.min(wanted, MAX_SHOT_PX / side))
}

export const distanceOf = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
