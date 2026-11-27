import { describe, expect, it, vi } from 'vitest'
import { initialStudio, studioReducer } from './state'
import { createThumbnailStore } from './thumbnails'

const outline = { path: '0', name: 'A', parts: 2, drawn: false, children: [] }

describe('studio state', () => {
  it('clears tree, ready, selection, hidden and sheet when the model key changes (new version or Preparing)', () => {
    let state = initialStudio('f1:4')
    state = studioReducer(state, { type: 'outline', outline })
    state = studioReducer(state, { type: 'ready', ready: true })
    state = studioReducer(state, { type: 'select', path: '0.1' })
    state = studioReducer(state, { type: 'toggleHidden', path: '0.0' })
    state = studioReducer(state, { type: 'sheet', sheet: { level: '0' } })
    expect(studioReducer(state, { type: 'reset', key: 'f1:4' })).toBe(state)
    expect(studioReducer(state, { type: 'reset', key: 'f1:4:preparing' })).toEqual(initialStudio('f1:4:preparing'))
  })

  it('toggles, unhides and shows all', () => {
    let state = studioReducer(initialStudio(null), { type: 'toggleHidden', path: '0.1' })
    state = studioReducer(state, { type: 'toggleHidden', path: '0.2' })
    expect([...studioReducer(state, { type: 'unhide', path: '0.1' }).hidden]).toEqual(['0.2'])
    expect(studioReducer(state, { type: 'showAll' }).hidden.size).toBe(0)
    const none = initialStudio(null)
    expect(studioReducer(none, { type: 'unhide', path: '0.1' })).toBe(none)
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
