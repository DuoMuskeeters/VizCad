import { describe, expect, it, vi } from 'vitest'
import { hiddenOn, initialStudio, studioReducer } from './state'
import { createThumbnailStore } from './thumbnails'

const outline = { path: '0', name: 'A', parts: 2, drawn: false, children: [] }

describe('studio state', () => {
  it('clears tree, ready, selection, hidden and sheet when the model key changes (new version or Preparing)', () => {
    let state = initialStudio('f1:4')
    state = studioReducer(state, { type: 'outline', outline })
    state = studioReducer(state, { type: 'ready', ready: true })
    state = studioReducer(state, { type: 'select', path: '0.1' })
    state = studioReducer(state, { type: 'toggleHidden', path: '0.0', hiddenNow: false })
    state = studioReducer(state, { type: 'editing', editing: true })
    state = studioReducer(state, { type: 'stl', path: '0.1' })
    state = studioReducer(state, { type: 'dismissMatch' })
    state = studioReducer(state, { type: 'sheet', sheet: { level: '0' } })
    expect(studioReducer(state, { type: 'reset', key: 'f1:4' })).toBe(state)
    expect(studioReducer(state, { type: 'reset', key: 'f1:4:preparing' })).toEqual(initialStudio('f1:4:preparing'))
  })

  it('hides and shows on this screen over the scene record, and shows all', () => {
    const scene = new Set(['0.1'])
    let state = initialStudio(null)
    // The record hides 0.1: showing it here is a local show; hiding 0.2 is a local hide.
    state = studioReducer(state, { type: 'toggleHidden', path: '0.1', hiddenNow: true })
    state = studioReducer(state, { type: 'toggleHidden', path: '0.2', hiddenNow: false })
    expect([...hiddenOn(state, scene)]).toEqual(['0.2'])
    // Hidden again: the local show is undone, the record decides.
    state = studioReducer(state, { type: 'toggleHidden', path: '0.1', hiddenNow: false })
    expect([...hiddenOn(state, scene)].sort()).toEqual(['0.1', '0.2'])
    state = studioReducer(state, { type: 'showAll', sceneHidden: scene })
    expect(hiddenOn(state, scene).size).toBe(0)
    state = studioReducer(state, { type: 'forget', path: '0.1' })
    expect([...hiddenOn(state, scene)]).toEqual(['0.1'])
  })
})

describe('thumbnail store', () => {
  it('keeps a node without an image as null, notifies, and frees URLs on clear', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const store = createThumbnailStore()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.get('0.1')).toBeUndefined()
    store.set('0.1', new Blob(['x']))
    store.set('0.2', null)
    store.set('0.2', new Blob(['late']))
    expect(store.get('0.1')).toBe('blob:1')
    expect(store.get('0.2')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    store.clear()
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(store.get('0.1')).toBeUndefined()
    create.mockRestore()
    revoke.mockRestore()
  })
})
