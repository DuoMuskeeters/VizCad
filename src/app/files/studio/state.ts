/**
 * What the studio does with the open model on this screen: its outline, whether it is drawn, the selection, the
 * person's own hide/show over the scene record's hidden nodes (B2, never saved), scene prep, the STL dialog, the
 * carried-over-colours offer and the phone's parts sheet. One reducer, so a new model (or the Preparing state, where no
 * model is open) clears all of it at once.
 */
import type { OutlineNode } from '#/viewer/tree/outline'

export type StudioState = {
  /** The model this state belongs to (`file:version`, `:preparing` while no viewer is mounted). */
  readonly key: string | null
  readonly outline: OutlineNode | null
  readonly ready: boolean
  readonly selected: string | null
  /** Hidden on this screen only, over the scene record. */
  readonly localHidden: ReadonlySet<string>
  /** The record hides them; this screen shows them. */
  readonly localShown: ReadonlySet<string>
  readonly editing: boolean
  readonly stlPath: string | null
  readonly matchDismissed: boolean
  readonly sheet: { readonly level: string } | null
}

export type StudioAction =
  | { readonly type: 'reset'; readonly key: string | null }
  | { readonly type: 'outline'; readonly outline: OutlineNode | null }
  | { readonly type: 'ready'; readonly ready: boolean }
  | { readonly type: 'select'; readonly path: string | null }
  /** `hiddenNow`: hidden on the screen at the moment (the record's and mine together). */
  | { readonly type: 'toggleHidden'; readonly path: string; readonly hiddenNow: boolean }
  /** Shows everything: mine cleared, every node the record hides shown. */
  | { readonly type: 'showAll'; readonly sceneHidden: ReadonlySet<string> }
  /** The record now decides this node (scene prep changed its visibility). */
  | { readonly type: 'forget'; readonly path: string }
  | { readonly type: 'editing'; readonly editing: boolean }
  | { readonly type: 'stl'; readonly path: string | null }
  | { readonly type: 'dismissMatch' }
  | { readonly type: 'sheet'; readonly sheet: { readonly level: string } | null }

const NONE: ReadonlySet<string> = new Set()

const without = (set: ReadonlySet<string>, path: string): ReadonlySet<string> => {
  if (!set.has(path)) return set
  const next = new Set(set)
  next.delete(path)
  return next
}
const plus = (set: ReadonlySet<string>, path: string): ReadonlySet<string> => (set.has(path) ? set : new Set([...set, path]))

export const initialStudio = (key: string | null): StudioState => ({
  key, outline: null, ready: false, selected: null, localHidden: NONE, localShown: NONE, editing: false, stlPath: null, matchDismissed: false, sheet: null,
})

/** What the screen hides: the record's hidden nodes minus the ones shown here, plus the ones hidden here. */
export const hiddenOn = (state: Pick<StudioState, 'localHidden' | 'localShown'>, sceneHidden: ReadonlySet<string>): ReadonlySet<string> =>
  sceneHidden.size === 0 && state.localShown.size === 0 ? state.localHidden : new Set([...[...sceneHidden].filter((path) => !state.localShown.has(path)), ...state.localHidden])

export const studioReducer = (state: StudioState, action: StudioAction): StudioState => {
  switch (action.type) {
    case 'reset':
      return state.key === action.key ? state : initialStudio(action.key)
    case 'outline':
      return state.outline === action.outline ? state : { ...state, outline: action.outline }
    case 'ready':
      return state.ready === action.ready ? state : { ...state, ready: action.ready }
    case 'select':
      return state.selected === action.path ? state : { ...state, selected: action.path }
    case 'toggleHidden': {
      const { path } = action
      // Shown again: undo my own hide, or override the record's. Hidden: undo my own show, or hide it myself.
      if (action.hiddenNow)
        return state.localHidden.has(path) ? { ...state, localHidden: without(state.localHidden, path) } : { ...state, localShown: plus(state.localShown, path) }
      return state.localShown.has(path) ? { ...state, localShown: without(state.localShown, path) } : { ...state, localHidden: plus(state.localHidden, path) }
    }
    case 'showAll':
      return { ...state, localHidden: NONE, localShown: action.sceneHidden.size === 0 ? NONE : new Set(action.sceneHidden) }
    case 'forget':
      return { ...state, localHidden: without(state.localHidden, action.path), localShown: without(state.localShown, action.path) }
    case 'editing':
      return state.editing === action.editing ? state : { ...state, editing: action.editing }
    case 'stl':
      return state.stlPath === action.path ? state : { ...state, stlPath: action.path }
    case 'dismissMatch':
      return state.matchDismissed ? state : { ...state, matchDismissed: true }
    case 'sheet':
      return { ...state, sheet: action.sheet }
  }
}
