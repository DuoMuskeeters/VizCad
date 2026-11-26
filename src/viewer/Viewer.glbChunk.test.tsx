// @vitest-environment jsdom
/** The lazily loaded GLTFLoader chunk did not arrive: that is the network (Retry), not a broken file. */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'

vi.mock('./pipeline', () => ({
  download: vi.fn(async () => ({ ok: true, bytes: new ArrayBuffer(16), contentType: 'model/gltf-binary' })),
  parseInWorker: vi.fn(),
  GLB_CONTENT_TYPE: 'model/gltf-binary',
}))
vi.mock('./scene/loadGlb', () => {
  throw new TypeError('Failed to fetch dynamically imported module')
})
vi.mock('./scene/createScene', () => ({
  WebGlUnavailable: class extends Error {},
  createScene: () => ({
    setModel: vi.fn(), dispose: vi.fn(), fit: vi.fn(), view: vi.fn(), setWireframe: vi.fn(), setEdges: vi.fn(),
    screenshot: vi.fn(async () => null), memory: () => ({ geometries: 0, textures: 0 }),
  }),
}))

const { default: Viewer } = await import('./Viewer.client')

describe('Viewer GLB chunk', () => {
  it('a failed import of the GLB reader offers Try again (network), not the corrupt text or a rebuild', async () => {
    render(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Viewer name="Pump.step" extension="step" size={1000} url="/api/files/f1/model" thumbnailUrl={null} start="auto" source="derivative" maxConvertBytes={1000} rebuildUrl="/api/files/f1/content" onDerivative={vi.fn()} />
        </UiProvider>
      </I18nProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('The file could not be read. It may be damaged.', { selector: 'p:not([role=status])' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rebuild 3D copy' })).not.toBeInTheDocument()
  })
})
