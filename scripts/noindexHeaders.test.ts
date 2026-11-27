import { describe, expect, it } from 'vitest'
import { NOINDEX_HEADERS, noindexHeaders } from './noindexHeaders'

type Emitted = { type: string; fileName: string; source: string }

const run = (production: boolean) => {
  const emitted: Array<Emitted> = []
  const plugin = noindexHeaders({ production })
  const hook = plugin.generateBundle
  const fn = typeof hook === 'function' ? hook : hook?.handler
  // Only `emitFile` of the Rollup plugin context is used.
  fn?.call({ emitFile: (file: Emitted) => void emitted.push(file) } as never, {} as never, {} as never, false)
  return { plugin, emitted }
}

describe('noindexHeaders (staging _headers)', () => {
  it('a staging build writes _headers with X-Robots-Tag for every static asset', () => {
    const { emitted } = run(false)
    expect(emitted).toEqual([{ type: 'asset', fileName: '_headers', source: NOINDEX_HEADERS }])
    expect(NOINDEX_HEADERS).toBe('/*\n  X-Robots-Tag: noindex, nofollow\n')
  })

  it('a production build writes nothing', () => {
    expect(run(true).emitted).toEqual([])
  })

  it('runs only in vite build and only for the client environment (the assets directory)', () => {
    const { plugin } = run(false)
    expect(plugin.apply).toBe('build')
    const applies = plugin.applyToEnvironment as (environment: { name: string }) => boolean
    expect(applies({ name: 'client' })).toBe(true)
    expect(applies({ name: 'ssr' })).toBe(false)
  })
})
