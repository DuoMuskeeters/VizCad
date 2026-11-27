/**
 * What the studio does with the open model on this screen (B2, never saved): its outline, whether it is drawn, the
 * selection, the person's hidden nodes and the phone's parts sheet. One reducer, so a new model (or the Preparing
 * state, where no model is open) clears all of it at once.
 */
import type { OutlineNode } from '#/viewer/tree/outline'

export type StudioState = {
  /** The model this state belongs to (`file:version`, `:preparing` while no viewer is mounted). */
  readonly key: string | null
  readonly outline: OutlineNode | null
  readonly ready: boolean
  readonly selected: string | null
  readonly hidden: ReadonlySet<string>
  readonly sheet: { readonly level: string } | null
}

export type StudioAction =
  | { readonly type: 'reset'; readonly key: string | null }
  | { readonly type: 'outline'; readonly outline: OutlineNode | null }
  | { readonly type: 'ready'; readonly ready: boolean }
  | { readonly type: 'select'; readonly path: string | null }
  | { readonly type: 'toggleHidden'; readonly path: string }
  | { readonly type: 'unhide'; readonly path: string }
  | { readonly type: 'showAll' }
  | { readonly type: 'sheet'; readonly sheet: { readonly level: string } | null }

const NONE: ReadonlySet<string> = new Set()

export const initialStudio = (key: string | null): StudioState => ({ key, outline: null, ready: false, selected: null, hidden: NONE, sheet: null })

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
      const hidden = new Set(state.hidden)
      if (hidden.has(action.path)) hidden.delete(action.path)
      else hidden.add(action.path)
      return { ...state, hidden }
    }
    case 'unhide': {
      if (!state.hidden.has(action.path)) return state
      const hidden = new Set(state.hidden)
      hidden.delete(action.path)
      return { ...state, hidden }
    }
    case 'showAll':
      return state.hidden.size === 0 ? state : { ...state, hidden: NONE }
    case 'sheet':
      return { ...state, sheet: action.sheet }
  }
}
