// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SceneBody } from '#/shared/scene'
import { SAVE_DELAY_MS, useScene } from './useScene'

const body = (color: string): SceneBody => ({ v: 1, nodes: { '0.1': { color } }, views: [] })

const server = (status = 200) => {
  const writes: Array<Record<string, unknown>> = []
  let release: (() => void) | null = null
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return new Response(JSON.stringify({ ok: true, data: { scene: null, previous: null, canEdit: true, maxViews: 20 } }))
    writes.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    if (writes.length === 1 && status === 200) await new Promise<void>((resolve) => (release = resolve))
    return status === 200
      ? new Response(JSON.stringify({ ok: true, data: { revision: writes.length, updatedAt: 1 } }))
      : new Response(JSON.stringify({ ok: false, error: 'SceneConflict' }), { status })
  }) as unknown as typeof fetch
  return { writes, fetcher, release: () => release?.() }
}

afterEach(() => vi.useRealTimers())

describe('useScene', () => {
  it('saves after a pause, one request at a time; a change made meanwhile follows on the next revision', async () => {
    const api = server()
    const { result } = renderHook(() => useScene('f1', 4, 'derivative:1', true, api.fetcher))
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    vi.useFakeTimers()
    act(() => result.current.change(body('#111111')))
    act(() => result.current.change(body('#222222')))
    expect(api.writes).toHaveLength(0)
    await act(async () => vi.advanceTimersByTime(SAVE_DELAY_MS))
    expect(api.writes).toEqual([{ version: 4, revision: 0, body: body('#222222') }])
    act(() => result.current.change(body('#333333')))
    await act(async () => vi.advanceTimersByTime(SAVE_DELAY_MS))
    expect(api.writes).toHaveLength(1)
    vi.useRealTimers()
    await act(async () => api.release())
    await waitFor(() => expect(api.writes).toEqual([{ version: 4, revision: 0, body: body('#222222') }, { version: 4, revision: 1, body: body('#333333') }]))
    await waitFor(() => expect(result.current.status).toBe('saved'))
  })

  it('leaving with a change still waiting sends it for the version it was made on', async () => {
    const api = server(200)
    const { result, rerender, unmount } = renderHook(({ version }) => useScene('f1', version, 'derivative:1', true, api.fetcher), { initialProps: { version: 4 } })
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#444444')))
    rerender({ version: 5 })
    await waitFor(() => expect(api.writes).toEqual([{ version: 4, revision: 0, body: body('#444444') }]))
    api.release()
    unmount()
  })

  it('a conflict stops saving until the record is read again', async () => {
    const api = server(409)
    const { result } = renderHook(() => useScene('f1', 4, 'derivative:1', true, api.fetcher))
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#555555'), true))
    await waitFor(() => expect(result.current.status).toBe('conflict'))
    act(() => result.current.change(body('#666666'), true))
    expect(api.writes).toHaveLength(1)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.body.nodes).toEqual({})
  })

  it('a save in flight when the model changes finishes for its own model; its late answers do not reach the new one', async () => {
    const answers: Array<() => void> = []
    const writes: Array<Record<string, unknown>> = []
    let reads = 0
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        reads++
        return new Response(JSON.stringify({ ok: true, data: { scene: reads === 1 ? null : { revision: 7, body: body('#999999'), updatedAt: 1, updatedBy: null }, previous: null, canEdit: true, maxViews: 20 } }))
      }
      writes.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      await new Promise<void>((resolve) => answers.push(resolve))
      // The old model's first save succeeds; its follow-up gets a conflict.
      return writes.length === 1
        ? new Response(JSON.stringify({ ok: true, data: { revision: 1, updatedAt: 1 } }))
        : new Response(JSON.stringify({ ok: false, error: 'SceneConflict' }), { status: 409 })
    }) as unknown as typeof fetch
    const { result, rerender } = renderHook(({ model }) => useScene('f1', 4, model, true, fetcher), { initialProps: { model: 'source:10' } })
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#111111'), true))
    await waitFor(() => expect(writes).toHaveLength(1))
    // A second change waits behind the first, then the GLB is stored: the page now reads another model.
    act(() => result.current.change(body('#222222')))
    rerender({ model: 'derivative:4' })
    await waitFor(() => expect(result.current.body).toEqual(body('#999999')))
    await act(async () => answers.shift()!())
    // The old session sends its waiting change on its own revision...
    await waitFor(() => expect(writes).toEqual([{ version: 4, revision: 0, body: body('#111111') }, { version: 4, revision: 1, body: body('#222222') }]))
    await act(async () => answers.shift()!())
    // ...and neither its success nor its late conflict touches the new model's state.
    expect(result.current.status).toBe('idle')
    expect(result.current.answer?.scene?.revision).toBe(7)
    expect(result.current.body).toEqual(body('#999999'))
  })

  it('does not read while disabled (Preparing) and reads when enabled', async () => {
    const api = server()
    const { result, rerender } = renderHook(({ enabled }) => useScene('f1', 4, 'source:10', enabled, api.fetcher), { initialProps: { enabled: false } })
    expect(api.fetcher).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    expect(api.fetcher).toHaveBeenCalledTimes(1)
  })

  it('refuses a body over the limits without sending it, and warns on leaving while a change waits', async () => {
    const api = server()
    const { result } = renderHook(() => useScene('f1', 4, 'derivative:1', true, api.fetcher))
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    const nodes = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`0.${i}`, { color: '#111111' }]))
    act(() => result.current.change({ v: 1, nodes, views: [] }, true))
    expect(result.current.status).toBe('tooLarge')
    expect(api.writes).toHaveLength(0)
    const quiet = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(quiet)
    expect(quiet.defaultPrevented).toBe(false)
    act(() => result.current.change(body('#777777')))
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)
  })

  it('sends a waiting change with keepalive on pagehide', async () => {
    const api = server()
    const { result } = renderHook(() => useScene('f1', 4, 'derivative:1', true, api.fetcher))
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#888888')))
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() => expect(api.writes).toEqual([{ version: 4, revision: 0, body: body('#888888') }]))
    const post = vi.mocked(api.fetcher).mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[1]?.keepalive).toBe(true)
    api.release()
  })
})
