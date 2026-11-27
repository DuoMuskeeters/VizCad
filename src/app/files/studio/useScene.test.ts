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
    const { result } = renderHook(() => useScene('f1', 4, true, api.fetcher))
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
    const { result, rerender, unmount } = renderHook(({ version }) => useScene('f1', version, true, api.fetcher), { initialProps: { version: 4 } })
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#444444')))
    rerender({ version: 5 })
    await waitFor(() => expect(api.writes).toEqual([{ version: 4, revision: 0, body: body('#444444') }]))
    api.release()
    unmount()
  })

  it('a conflict stops saving until the record is read again', async () => {
    const api = server(409)
    const { result } = renderHook(() => useScene('f1', 4, true, api.fetcher))
    await waitFor(() => expect(result.current.answer).not.toBeNull())
    act(() => result.current.change(body('#555555'), true))
    await waitFor(() => expect(result.current.status).toBe('conflict'))
    act(() => result.current.change(body('#666666'), true))
    expect(api.writes).toHaveLength(1)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.body.nodes).toEqual({})
  })
})
