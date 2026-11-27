// @vitest-environment jsdom
/** The studio tools chunk did not arrive: it is not kept as "no tools"; the next call loads it again. */
import { render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import type { ViewerApi } from './Viewer.client'

const chunk = vi.hoisted(() => ({ fail: true, tools: { dispose: () => {} } }))

vi.mock('./pipeline', () => ({
  download: vi.fn(async () => ({ ok: true, bytes: new ArrayBuffer(8), contentType: 'application/octet-stream' })),
  parseInWorker: vi.fn(() => ({ result: Promise.resolve({ ok: true, model: { meshes: [], tree: null, up: 'z' }, stats: { triangles: 1, nodes: 1, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }, thumbnail: null, glb: null }), cancel: vi.fn() })),
  GLB_CONTENT_TYPE: 'model/gltf-binary',
}))
vi.mock('./scene/build', () => ({ buildModel: () => ({}) }))
vi.mock('./scene/createScene', () => ({
  WebGlUnavailable: class extends Error {},
  createScene: () => ({
    setModel: vi.fn(), dispose: vi.fn(), fit: vi.fn(), view: vi.fn(), setWireframe: vi.fn(), setEdges: vi.fn(), outline: () => null, setView: vi.fn(), focus: vi.fn(),
    screenshot: vi.fn(async () => null), memory: () => ({ geometries: 0, textures: 0 }), host: () => ({}),
  }),
}))
vi.mock('./tools/tools', () => {
  if (chunk.fail) throw new TypeError('Failed to fetch dynamically imported module')
  return { createTools: () => chunk.tools }
})

const { default: Viewer } = await import('./Viewer.client')

describe('Viewer tools chunk', () => {
  it('a failed load rejects and is not cached: the next call tries the chunk again', async () => {
    const api = createRef<ViewerApi | null>() as { current: ViewerApi | null }
    render(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Viewer name="Bracket.stl" extension="stl" size={1000} url="/api/files/f1/model" thumbnailUrl={null} start="auto" source="source" maxConvertBytes={1000} studio={{ view: { hidden: new Set(), isolated: null, selected: null, looks: new Map() } as never, onOutline: vi.fn(), onPick: vi.fn(), api }} />
        </UiProvider>
      </I18nProvider>,
    )
    await waitFor(() => expect(api.current).not.toBeNull())
    await expect(api.current!.tools()).rejects.toThrow()
    chunk.fail = false
    vi.resetModules()
    await expect(api.current!.tools()).resolves.toBe(chunk.tools)
  })
})
