import { describe, expect, it, vi } from 'vitest'

// The app's route tree reaches Worker-only modules (server routes); importing them is enough here.
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: () => {}, DurableObject: class {} }))

describe("the app's router", () => {
  it('reads and writes search with the app options (?node=0.10 stays a string)', async () => {
    const { getRouter } = await import('./router')
    const router = getRouter()
    expect(router.options.parseSearch('?node=0.10')).toEqual({ node: '0.10' })
    expect(router.options.stringifySearch({ node: '0.10' })).toBe('?node=0.10')
  })
})
