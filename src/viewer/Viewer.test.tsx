// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import type { ParsedModel, Stats } from './worker/protocol'

const stats: Stats = { triangles: 12, nodes: 1, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 1 }
const model: ParsedModel = { meshes: [], tree: { name: 'x', path: '0', mesh: null, matrix: null, children: [] }, up: 'z' }

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  parseInWorker: vi.fn(),
  buildModel: vi.fn(),
  setModel: vi.fn(),
  dispose: vi.fn(),
  loadGlb: vi.fn(),
}))

vi.mock('./pipeline', () => ({ download: mocks.download, parseInWorker: mocks.parseInWorker, GLB_CONTENT_TYPE: 'model/gltf-binary' }))
vi.mock('./scene/loadGlb', () => ({ loadGlb: mocks.loadGlb }))
vi.mock('./scene/build', () => ({ buildModel: mocks.buildModel }))
vi.mock('./scene/createScene', () => ({
  WebGlUnavailable: class extends Error {},
  createScene: () => ({
    setModel: mocks.setModel, dispose: mocks.dispose, fit: vi.fn(), view: vi.fn(), setWireframe: vi.fn(), setEdges: vi.fn(),
    screenshot: vi.fn(async () => null), memory: () => ({ geometries: 0, textures: 0 }),
  }),
}))

const { default: Viewer } = await import('./Viewer.client')

const wrap = (ui: ReactNode) => (
  <I18nProvider initialLocale="en">
    <UiProvider>{ui}</UiProvider>
  </I18nProvider>
)

const props = {
  name: 'Bracket.stl', extension: 'stl', size: 1000, url: '/api/files/f1/model', thumbnailUrl: null, start: 'auto', source: 'source', maxConvertBytes: 50 * 1024 * 1024,
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.download.mockResolvedValue({ ok: true, bytes: new ArrayBuffer(8), contentType: 'application/octet-stream' })
  mocks.parseInWorker.mockImplementation(() => ({ result: Promise.resolve({ ok: true, model, stats, thumbnail: null, glb: null }), cancel: vi.fn() }))
  mocks.loadGlb.mockResolvedValue({ root: { glb: true }, stats })
  mocks.buildModel.mockReturnValue({})
})

describe('Viewer', () => {
  it('opens the model once; a rename does not reload it, a new URL does', async () => {
    const view = render(wrap(<Viewer {...props} />))
    await waitFor(() => expect(mocks.setModel).toHaveBeenCalledTimes(1))
    expect(mocks.download).toHaveBeenCalledWith('/api/files/f1/model', expect.anything(), expect.any(Function))
    expect(mocks.parseInWorker).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bracket.stl' }))
    view.rerender(wrap(<Viewer {...props} name="Bracket rev2.stl" />))
    await act(async () => {})
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.setModel).toHaveBeenCalledTimes(1)
    view.rerender(wrap(<Viewer {...props} name="Bracket rev2.stl" url="/api/files/f2/model" />))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
    expect(mocks.parseInWorker).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Bracket rev2.stl' }))
  })

  it('refuses STEP/IGES/3MF over the conversion limit before downloading; STL of that size still opens', async () => {
    render(wrap(<Viewer {...props} name="Big.step" extension="step" size={60 * 1024 * 1024} />))
    expect(await screen.findByText('This file is too large to open in the browser (over 50 MB).', { selector: 'p:not([role=status])' })).toBeInTheDocument()
    expect(mocks.download).not.toHaveBeenCalled()
    render(wrap(<Viewer {...props} size={60 * 1024 * 1024} />))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
  })

  it('a main-thread failure after a good parse is an error state, not a stuck loader', async () => {
    mocks.buildModel.mockImplementation(() => {
      throw new RangeError('Array buffer allocation failed')
    })
    render(wrap(<Viewer {...props} />))
    expect(await screen.findByText(/could not be opened on this device/, { selector: 'p:not([role=status])' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a Worker that did not load offers a retry', async () => {
    mocks.parseInWorker.mockImplementationOnce(() => ({ result: Promise.resolve({ ok: false, code: 'network' }), cancel: vi.fn() }))
    render(wrap(<Viewer {...props} />))
    const retry = await screen.findByRole('button', { name: 'Try again' })
    await act(async () => retry.click())
    await waitFor(() => expect(mocks.setModel).toHaveBeenCalledTimes(1))
    expect(mocks.download).toHaveBeenCalledTimes(2)
  })

  it('the live region announces the stage, not every percent', async () => {
    let progress: (ratio: number | null) => void = () => {}
    let finish: (value: { ok: true; bytes: ArrayBuffer; contentType: string }) => void = () => {}
    mocks.download.mockImplementation((_url: string, _signal: AbortSignal, onProgress: (ratio: number | null) => void) => {
      progress = onProgress
      return new Promise((resolve) => (finish = resolve))
    })
    render(wrap(<Viewer {...props} />))
    const live = screen.getByRole('status')
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    act(() => progress(0.1))
    expect(screen.getByText('Downloading · 10%')).toBeInTheDocument()
    expect(live).toHaveTextContent(/^Downloading$/)
    act(() => progress(0.57))
    expect(screen.getByText('Downloading · 57%')).toBeInTheDocument()
    expect(live).toHaveTextContent(/^Downloading$/)
    await act(async () => finish({ ok: true, bytes: new ArrayBuffer(8), contentType: 'application/octet-stream' }))
    await waitFor(() => expect(live).toHaveTextContent(''))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('a GLB derivative opens through GLTFLoader on the main thread: no Worker, no conversion', async () => {
    mocks.download.mockResolvedValue({ ok: true, bytes: new ArrayBuffer(16), contentType: 'model/gltf-binary' })
    const onDerivative = vi.fn()
    render(wrap(<Viewer {...props} name="Pump.step" extension="step" size={80 * 1024 * 1024} source="derivative" onDerivative={onDerivative} />))
    await waitFor(() => expect(mocks.setModel).toHaveBeenCalledWith({ glb: true }, stats))
    expect(mocks.parseInWorker).not.toHaveBeenCalled()
    expect(onDerivative).not.toHaveBeenCalled()
    expect(screen.getByText('12 triangles · 1 part')).toBeInTheDocument()
  })

  it('a broken GLB is an error state', async () => {
    mocks.download.mockResolvedValue({ ok: true, bytes: new ArrayBuffer(16), contentType: 'model/gltf-binary' })
    const { ParseFailure } = await import('./worker/protocol')
    mocks.loadGlb.mockRejectedValueOnce(new ParseFailure('too_complex'))
    render(wrap(<Viewer {...props} source="derivative" />))
    expect(await screen.findByText(/too many parts or triangles/, { selector: 'p:not([role=status])' })).toBeInTheDocument()
  })

  it('lazy path: a STEP source is converted with derive, shown, then its GLB is handed over', async () => {
    const glb = new ArrayBuffer(4)
    mocks.parseInWorker.mockImplementation(() => ({ result: Promise.resolve({ ok: true, model, stats, thumbnail: null, glb }), cancel: vi.fn() }))
    const onDerivative = vi.fn()
    const onConvertFailed = vi.fn()
    render(wrap(<Viewer {...props} name="Pump.step" extension="step" onDerivative={onDerivative} onConvertFailed={onConvertFailed} />))
    await waitFor(() => expect(onDerivative).toHaveBeenCalledWith(glb, stats))
    expect(mocks.parseInWorker).toHaveBeenCalledWith(expect.objectContaining({ derive: true, maxConvertBytes: 50 * 1024 * 1024 }))
    expect(mocks.setModel).toHaveBeenCalledTimes(1)
    expect(onConvertFailed).not.toHaveBeenCalled()
  })

  it('without a store for it (no edit, or STL), nothing is derived', async () => {
    render(wrap(<Viewer {...props} name="Pump.step" extension="step" />))
    await waitFor(() => expect(mocks.setModel).toHaveBeenCalled())
    expect(mocks.parseInWorker).toHaveBeenCalledWith(expect.objectContaining({ derive: false }))
    render(wrap(<Viewer {...props} onDerivative={vi.fn()} />))
    await waitFor(() => expect(mocks.parseInWorker).toHaveBeenLastCalledWith(expect.objectContaining({ derive: false })))
  })

  it('reports conversion failures that are the file’s: the code, too_large before any download; never network', async () => {
    const onConvertFailed = vi.fn()
    mocks.parseInWorker.mockImplementationOnce(() => ({ result: Promise.resolve({ ok: false, code: 'corrupt' }), cancel: vi.fn() }))
    const first = render(wrap(<Viewer {...props} extension="step" onDerivative={vi.fn()} onConvertFailed={onConvertFailed} />))
    await waitFor(() => expect(onConvertFailed).toHaveBeenCalledWith('corrupt'))
    first.unmount()
    mocks.parseInWorker.mockImplementationOnce(() => ({ result: Promise.resolve({ ok: false, code: 'network' }), cancel: vi.fn() }))
    const second = render(wrap(<Viewer {...props} extension="step" onDerivative={vi.fn()} onConvertFailed={onConvertFailed} />))
    await screen.findByRole('button', { name: 'Try again' })
    expect(onConvertFailed).toHaveBeenCalledTimes(1)
    second.unmount()
    render(wrap(<Viewer {...props} extension="3mf" size={2000} maxConvertBytes={1000} onDerivative={vi.fn()} onConvertFailed={onConvertFailed} />))
    expect(await screen.findByText('This file is too large to open in the browser (over 0 MB).', { selector: 'p:not([role=status])' })).toBeInTheDocument()
    expect(onConvertFailed).toHaveBeenLastCalledWith('too_large')
  })

  it('a derivative that failed before is shown without converting again; an edit user may retry', async () => {
    const onDerivative = vi.fn()
    render(wrap(<Viewer {...props} extension="step" start={{ failed: 'corrupt' }} retryAlways onDerivative={onDerivative} />))
    expect(screen.getByText('The file could not be read. It may be damaged.', { selector: 'p:not([role=status])' })).toBeInTheDocument()
    expect(mocks.download).not.toHaveBeenCalled()
    await act(async () => screen.getByRole('button', { name: 'Try again' }).click())
    await waitFor(() => expect(mocks.parseInWorker).toHaveBeenCalledWith(expect.objectContaining({ derive: true })))
  })

  it('a reload that finds the GLB stored (source → derivative) does not restart the open model', async () => {
    const view = render(wrap(<Viewer {...props} name="Pump.step" extension="step" onDerivative={vi.fn()} />))
    await waitFor(() => expect(mocks.setModel).toHaveBeenCalledTimes(1))
    view.rerender(wrap(<Viewer {...props} name="Pump.step" extension="step" source="derivative" modelBytes={6_200_000} rebuildUrl="/api/files/f1/content" />))
    await act(async () => {})
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.setModel).toHaveBeenCalledTimes(1)
    expect(mocks.dispose).not.toHaveBeenCalled()
  })

  it('an editor can rebuild a GLB that does not load: the source is read from rebuildUrl, converted and stored again', async () => {
    mocks.download.mockResolvedValueOnce({ ok: true, bytes: new ArrayBuffer(16), contentType: 'model/gltf-binary' })
    const { ParseFailure } = await import('./worker/protocol')
    mocks.loadGlb.mockRejectedValueOnce(new ParseFailure('corrupt'))
    const glb = new ArrayBuffer(4)
    mocks.parseInWorker.mockImplementation(() => ({ result: Promise.resolve({ ok: true, model, stats, thumbnail: null, glb }), cancel: vi.fn() }))
    const onDerivative = vi.fn()
    render(wrap(<Viewer {...props} name="Pump.step" extension="step" source="derivative" rebuildUrl="/api/files/f1/content" onDerivative={onDerivative} />))
    const rebuild = await screen.findByRole('button', { name: 'Rebuild 3D copy' })
    await act(async () => rebuild.click())
    await waitFor(() => expect(onDerivative).toHaveBeenCalledWith(glb, stats))
    expect(mocks.download).toHaveBeenLastCalledWith('/api/files/f1/content', expect.anything(), expect.any(Function))
    expect(mocks.parseInWorker).toHaveBeenCalledWith(expect.objectContaining({ derive: true }))
  })

  it('no rebuild without rebuildUrl, and none for a GLB that only failed to download', async () => {
    mocks.download.mockResolvedValueOnce({ ok: true, bytes: new ArrayBuffer(16), contentType: 'model/gltf-binary' })
    const { ParseFailure } = await import('./worker/protocol')
    mocks.loadGlb.mockRejectedValueOnce(new ParseFailure('corrupt'))
    const first = render(wrap(<Viewer {...props} extension="step" source="derivative" />))
    await screen.findByText('The file could not be read. It may be damaged.', { selector: 'p:not([role=status])' })
    expect(screen.queryByRole('button', { name: 'Rebuild 3D copy' })).not.toBeInTheDocument()
    first.unmount()
    mocks.download.mockResolvedValueOnce({ ok: false })
    render(wrap(<Viewer {...props} extension="step" source="derivative" rebuildUrl="/api/files/f1/content" onDerivative={vi.fn()} />))
    await screen.findByRole('button', { name: 'Try again' })
    expect(screen.queryByRole('button', { name: 'Rebuild 3D copy' })).not.toBeInTheDocument()
  })

  it('mobile shared page: nothing downloads until “Open 3D · size” is pressed', async () => {
    render(wrap(<Viewer {...props} start="tap" source="derivative" modelBytes={6_200_000} />))
    const open = screen.getByRole('button', { name: 'Open 3D · 6.2 MB' })
    expect(mocks.download).not.toHaveBeenCalled()
    await act(async () => open.click())
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
  })
})
