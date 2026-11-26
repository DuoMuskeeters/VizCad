import { describe, expect, it } from 'vitest'
import { EDGES_TRIANGLE_LIMIT, edgesAvailable, errorActions, errorTextKey, initialViewerState, viewerReducer, type ViewerAction, type ViewerState } from './state'
import { ERROR_CODES, type Stats } from './worker/protocol'

const stats = (triangles = 1000): Stats => ({ triangles, nodes: 1, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 5 })
const run = (state: ViewerState, ...actions: ViewerAction[]) => actions.reduce(viewerReducer, state)

describe('viewerReducer', () => {
  it('starts loading, or idle on a phone for STEP', () => {
    expect(initialViewerState(false).phase).toEqual({ status: 'loading', stage: 'download', ratio: null })
    expect(initialViewerState(false).attempt).toBe(1)
    expect(initialViewerState(true).phase).toEqual({ status: 'idle', reason: 'phone' })
    expect(initialViewerState(true).attempt).toBe(0)
  })

  it('walks loading → ready with clamped progress', () => {
    const s = run(initialViewerState(false), { type: 'progress', stage: 'download', ratio: 0.42 }, { type: 'progress', stage: 'convert', ratio: 7 })
    expect(s.phase).toEqual({ status: 'loading', stage: 'convert', ratio: 1 })
    expect(run(s, { type: 'progress', stage: 'parse', ratio: Number.NaN }).phase).toEqual({ status: 'loading', stage: 'parse', ratio: null })
    const ready = run(s, { type: 'ready', stats: stats() })
    expect(ready.phase).toEqual({ status: 'ready', stats: stats() })
    // Late progress or a second answer of an old job cannot move a finished viewer.
    expect(run(ready, { type: 'progress', stage: 'download', ratio: 0.1 })).toBe(ready)
    expect(run(ready, { type: 'fail', code: 'corrupt' })).toBe(ready)
  })

  it('fails only while loading, except a missing WebGL', () => {
    const failed = run(initialViewerState(false), { type: 'fail', code: 'empty' })
    expect(failed.phase).toEqual({ status: 'error', code: 'empty' })
    const idle = initialViewerState(true)
    expect(run(idle, { type: 'fail', code: 'corrupt' })).toBe(idle)
    expect(run(idle, { type: 'fail', code: 'webgl' }).phase).toEqual({ status: 'error', code: 'webgl' })
  })

  it('cancel goes idle; start retries with a new attempt and resets the toggles', () => {
    const canceled = run(initialViewerState(false), { type: 'cancel' })
    expect(canceled.phase).toEqual({ status: 'idle', reason: 'canceled' })
    const again = run(canceled, { type: 'start' })
    expect(again.phase.status).toBe('loading')
    expect(again.attempt).toBe(2)
    const ready = run(again, { type: 'ready', stats: stats() }, { type: 'toggleWireframe' }, { type: 'toggleEdges' })
    expect([ready.wireframe, ready.edges]).toEqual([true, true])
    const retried = run(ready, { type: 'start' })
    expect([retried.wireframe, retried.edges, retried.attempt]).toEqual([false, false, 3])
    // A start while already loading is ignored (double click).
    expect(run(retried, { type: 'start' })).toBe(retried)
    expect(run(ready, { type: 'cancel' })).toBe(ready)
  })

  it('toggles display modes only when ready; edges respect the triangle limit', () => {
    const loading = initialViewerState(false)
    expect(run(loading, { type: 'toggleWireframe' })).toBe(loading)
    expect(run(loading, { type: 'toggleEdges' })).toBe(loading)
    const big = run(loading, { type: 'ready', stats: stats(EDGES_TRIANGLE_LIMIT + 1) })
    expect(edgesAvailable(big)).toBe(false)
    expect(run(big, { type: 'toggleEdges' }).edges).toBe(false)
    expect(run(big, { type: 'toggleWireframe' }, { type: 'toggleWireframe' }).wireframe).toBe(false)
    const small = run(loading, { type: 'ready', stats: stats(EDGES_TRIANGLE_LIMIT) })
    expect(edgesAvailable(small)).toBe(true)
  })

  it('keeps the tool', () => {
    const s = initialViewerState(false)
    expect(run(s, { type: 'setTool', tool: 'orbit' })).toBe(s)
  })

  it('has a text and actions for every error code', () => {
    for (const code of [...ERROR_CODES, 'network', 'webgl'] as const) expect(errorTextKey(code)).toMatch(/^viewer\.error\./)
    expect(errorActions('corrupt')).toEqual({ retry: false, newVersion: true })
    expect(errorActions('network')).toEqual({ retry: true, newVersion: false })
    expect(errorActions('too_large')).toEqual({ retry: false, newVersion: false })
  })
})
