import { beforeEach, describe, expect, it, vi } from 'vitest'

const setResponseStatus = vi.fn<(status: number) => void>()
vi.mock('@tanstack/react-start/server', () => ({ setResponseStatus }))
vi.mock('cloudflare:workers', () => ({ env: {} }))

const { markStatus, pageHeaders } = await import('./data')

describe('blog page status on the SSR response', () => {
  beforeEach(() => setResponseStatus.mockClear())

  it('a server failure answers 500 and an archived post 410, never 200 "Something broke"', async () => {
    const failed = { ok: false, status: 500 } as const
    expect(await markStatus(failed)).toBe(failed)
    expect(setResponseStatus.mock.calls).toEqual([[500]])
    await markStatus({ ok: false, status: 410 })
    expect(setResponseStatus.mock.calls).toEqual([[500], [410]])
  })

  it('a page and a 404 (the route throws notFound) set nothing', async () => {
    await markStatus({ ok: true })
    await markStatus({ ok: false, status: 404 })
    expect(setResponseStatus).not.toHaveBeenCalled()
  })

  it('every failed result opts out of the edge cache and the browser cache', () => {
    expect(pageHeaders({ ok: false })).toEqual({ 'x-vizcad-no-store': '1', 'cache-control': 'no-store' })
    expect(pageHeaders({ ok: true })).toEqual({})
  })
})
