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
}))

vi.mock('./pipeline', () => ({ download: mocks.download, parseInWorker: mocks.parseInWorker }))
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

const props = { name: 'Bracket.stl', extension: 'stl', size: 1000, url: '/api/files/f1/model', thumbnailUrl: null, deferred: false }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.download.mockResolvedValue({ ok: true, bytes: new ArrayBuffer(8) })
  mocks.parseInWorker.mockImplementation(() => ({ result: Promise.resolve({ ok: true, model, stats, thumbnail: null }), cancel: vi.fn() }))
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
    let finish: (value: { ok: true; bytes: ArrayBuffer }) => void = () => {}
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
    await act(async () => finish({ ok: true, bytes: new ArrayBuffer(8) }))
    await waitFor(() => expect(live).toHaveTextContent(''))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
