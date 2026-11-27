import { isNotFound } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { devOnly } from './guard'

describe('devOnly', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('runs the handler outside production', async () => {
    const handler = vi.fn(async (n: number) => n + 1)
    await expect(devOnly(handler)(1)).resolves.toBe(2)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('a production build answers notFound without running the handler (a direct server function call skips beforeLoad)', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VIZCAD_PRODUCTION', 'true')
    const handler = vi.fn(async () => 'data')
    const error: unknown = await devOnly(handler)().then(() => undefined, (e: unknown) => e)
    expect(isNotFound(error)).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })
})
