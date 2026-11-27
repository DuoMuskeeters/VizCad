/**
 * What the page and the lazily loaded tools (`tools.ts`, docs/11 §4.3) agree on. Plain data only: no three.js, so the
 * page side (`app/files/studio/`) can import it without pulling the viewer chunk in.
 */
export type Axis = 'x' | 'y' | 'z'

export type Vec3 = readonly [number, number, number]

/** The section plane (docs/11 §4.3): an axis, a place along the model's box (0–1), which side is cut away. */
export type SectionSettings = {
  readonly axis: Axis
  /** 0 = the box's low end, 1 = its high end. */
  readonly position: number
  /** false keeps the low side (cuts away what is above the plane); true keeps the high side. */
  readonly flipped: boolean
  /** Cut faces drawn hatched (docs/03 §4.2). */
  readonly hatch: boolean
  /** The plane handle on the canvas (desktop only, docs/11 §4.4: on a phone it fights the orbit gesture). */
  readonly handle: boolean
}

export type CoveredRect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** The model's extent along an axis, in model units (mm). */
export type SectionRange = { readonly min: number; readonly max: number }

export type Snap = 'vertex' | 'edge' | 'surface'

export type MeasurePoint = { readonly point: Vec3; readonly path: string | null; readonly snap: Snap }

export type Measurement = {
  readonly id: number
  readonly a: MeasurePoint
  readonly b: MeasurePoint
  /** Model units (mm). */
  readonly distance: number
  readonly delta: Vec3
}

export type MeasureState = {
  readonly list: readonly Measurement[]
  /** The first point of the next measurement, until the second is chosen. */
  readonly pending: MeasurePoint | null
}

/** `mouse`: hover with vertex and edge snapping, click to place. `touch`: hold, slide under a magnifier, release (§4.4). */
export type MeasureMode = 'mouse' | 'touch'

/** B8 defaults: twice the size, the canvas background, pins and measurements included. */
export type ScreenshotOptions = {
  readonly background: 'canvas' | 'white' | 'transparent'
  readonly scale: 1 | 2
  readonly pins: boolean
  readonly measures: boolean
}

export const SCREENSHOT_DEFAULTS: ScreenshotOptions = { background: 'canvas', scale: 2, pins: true, measures: true }

/** Texts the tools draw on the canvas; the page owns the language and the unit. */
export type ToolLabels = {
  readonly vertex: string
  readonly edge: string
  /** A length in model units (mm) as the page shows it ("1.000,0 mm", "39.37 in"). */
  readonly length: (mm: number) => string
  /** The section handle's tag ("X = 640 mm"). */
  readonly plane: (axis: Axis, mm: number) => string
}

/** A saved view's camera (docs/11 §3.1 `views[].camera`). */
export type CameraState = { readonly position: Vec3; readonly target: Vec3; readonly up: Vec3; readonly fov: number }

/** A comment pin on the canvas: the node and the point in its own coordinates; `id` '' is the pin being written. */
export type PinMark = {
  readonly id: string
  /** The number drawn in the pin. */
  readonly label: string
  readonly path: string
  readonly point: Vec3
  readonly active: boolean
}

export type ToolsApi = {
  readonly section: {
    /** null turns the section off. */
    readonly set: (settings: SectionSettings | null) => void
    readonly range: (axis: Axis) => SectionRange | null
    /** The handle was dragged to a new position (0–1). */
    readonly onDrag: (listener: (position: number) => void) => () => void
    /** The part the range fits (the isolated one), null for the whole model. */
    readonly setScope: (path: string | null) => void
    /** The canvas area under the open card (CSS px from the canvas's top left): the handle keeps out of it. */
    readonly setCovered: (rect: CoveredRect | null) => void
  }
  readonly measure: {
    readonly start: (mode: MeasureMode, single: boolean) => void
    /** Stops placing points; what was measured stays drawn (it goes into a screenshot, B8). */
    readonly stop: () => void
    readonly remove: (id: number) => void
    readonly clear: () => void
    readonly subscribe: (listener: (state: MeasureState) => void) => () => void
  }
  readonly pins: {
    /** What is drawn; a pin whose part is hidden or cut away is drawn faded. */
    readonly set: (pins: readonly PinMark[]) => void
    /** The next click on the model places a pin (node path + point in the node's coordinates) instead of picking. */
    readonly start: (onPlace: (pin: { readonly path: string; readonly point: Vec3 }) => void) => void
    readonly stop: () => void
    /** A press on a drawn pin. */
    readonly onSelect: (listener: (id: string) => void) => () => void
  }
  readonly camera: {
    readonly get: () => CameraState
    /** Moves the camera there at once (a saved view). */
    readonly set: (camera: CameraState) => void
  }
  readonly setLabels: (labels: ToolLabels) => void
  readonly screenshot: (options: ScreenshotOptions) => Promise<Blob | null>
  readonly dispose: () => void
}
