/**
 * The viewer's React state (docs/11 §1.1): one pure reducer over plain data. three.js objects never enter it; the scene
 * lives in a ref. 5c adds the selected node and the isolated path, 5d more tools.
 */
import type { I18nKey } from '#/i18n'
import type { ErrorCode, Stage, Stats } from './worker/protocol'

/** Edges (EdgesGeometry, 30°) are off above this many triangles: building them would stall the page. */
export const EDGES_TRIANGLE_LIMIT = 1_500_000

/** `network` comes from the Worker too (its chunk or the WASM did not load), and from the model download. */
export type ViewerError = ErrorCode | 'webgl'

export type LoadStage = 'download' | Stage | 'build'

/**
 * Why the viewer waits for a tap: `phone` a STEP/IGES source on a phone (5a, conversion is heavy); `tap` the mobile shared
 * page, which never opens 3D by itself (docs/11 §6: data and battery); `canceled` the person stopped it.
 */
export type IdleReason = 'phone' | 'tap' | 'canceled'

export type Phase =
  | { readonly status: 'idle'; readonly reason: IdleReason }
  | { readonly status: 'loading'; readonly stage: LoadStage; readonly ratio: number | null }
  | { readonly status: 'ready'; readonly stats: Stats }
  | { readonly status: 'error'; readonly code: ViewerError }

/** Orbit is the only tool of 5a; section and measure join in 5d. */
export type Tool = 'orbit'

export type ViewerState = {
  readonly phase: Phase
  readonly tool: Tool
  readonly wireframe: boolean
  readonly edges: boolean
  /** Bumped on every start: effects key the load on it, so a retry reloads. */
  readonly attempt: number
}

export type ViewerAction =
  | { readonly type: 'start' }
  | { readonly type: 'progress'; readonly stage: LoadStage; readonly ratio: number | null }
  | { readonly type: 'ready'; readonly stats: Stats }
  | { readonly type: 'fail'; readonly code: ViewerError }
  | { readonly type: 'cancel' }
  | { readonly type: 'setTool'; readonly tool: Tool }
  | { readonly type: 'toggleWireframe' }
  | { readonly type: 'toggleEdges' }

/**
 * How a viewer starts: open at once, wait for a tap (`phone`, `tap`), or show a stored failure (a derivative that
 * failed before is not converted again on every open, docs/11 §2.2; an edit user may retry). `true`/`false` are the 5a
 * shorthand for `phone`/`auto`.
 */
export type ViewerStart = 'auto' | 'phone' | 'tap' | { readonly failed: ViewerError } | boolean

export const initialViewerState = (start: ViewerStart): ViewerState => {
  const mode = start === true ? 'phone' : start === false ? 'auto' : start
  const phase: Phase = mode === 'auto' ? { status: 'loading', stage: 'download', ratio: null }
    : mode === 'phone' || mode === 'tap' ? { status: 'idle', reason: mode }
    : { status: 'error', code: mode.failed }
  return { phase, tool: 'orbit', wireframe: false, edges: false, attempt: mode === 'auto' ? 1 : 0 }
}

export const edgesAvailable = (state: ViewerState) => state.phase.status === 'ready' && state.phase.stats.triangles <= EDGES_TRIANGLE_LIMIT

const clamp = (ratio: number | null) => (ratio === null || !Number.isFinite(ratio) ? null : Math.min(1, Math.max(0, ratio)))

export const viewerReducer = (state: ViewerState, action: ViewerAction): ViewerState => {
  switch (action.type) {
    case 'start':
      if (state.phase.status === 'loading' && state.attempt > 0) return state
      return { ...state, phase: { status: 'loading', stage: 'download', ratio: null }, wireframe: false, edges: false, attempt: state.attempt + 1 }
    case 'progress':
      if (state.phase.status !== 'loading') return state
      return { ...state, phase: { status: 'loading', stage: action.stage, ratio: clamp(action.ratio) } }
    case 'ready':
      if (state.phase.status !== 'loading') return state
      return { ...state, phase: { status: 'ready', stats: action.stats } }
    case 'fail':
      if (state.phase.status !== 'loading' && action.code !== 'webgl') return state
      return { ...state, phase: { status: 'error', code: action.code } }
    case 'cancel':
      if (state.phase.status !== 'loading') return state
      return { ...state, phase: { status: 'idle', reason: 'canceled' } }
    case 'setTool':
      return state.tool === action.tool ? state : { ...state, tool: action.tool }
    case 'toggleWireframe':
      return state.phase.status === 'ready' ? { ...state, wireframe: !state.wireframe } : state
    case 'toggleEdges':
      return edgesAvailable(state) ? { ...state, edges: !state.edges } : state
  }
}

/** Which §8 text an error shows. */
export const errorTextKey = (code: ViewerError): I18nKey => {
  switch (code) {
    case 'empty':
      return 'viewer.error.empty'
    case 'too_large':
      return 'viewer.error.tooLarge'
    case 'too_complex':
      return 'viewer.error.tooComplex'
    case 'timeout':
    case 'out_of_memory':
      return 'viewer.error.device'
    case 'corrupt':
    case 'unsupported':
      return 'viewer.error.corrupt'
    case 'network':
      return 'viewer.error.network'
    case 'webgl':
      return 'viewer.error.webgl'
  }
}

/** A new version can fix the file itself; a retry can fix the connection. */
export const errorActions = (code: ViewerError): { readonly retry: boolean; readonly newVersion: boolean } => ({
  retry: code === 'network' || code === 'timeout' || code === 'out_of_memory',
  newVersion: code === 'corrupt' || code === 'unsupported' || code === 'empty',
})
