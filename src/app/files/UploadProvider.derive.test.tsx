// @vitest-environment jsdom
/** After-upload jobs (docs/11 §2.5): STEP/IGES/3MF are converted once on a desktop, the card says "Preparing", leaving warns. */
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeriveOutcome } from '#/viewer/pipeline'
import { renderApp } from './testApp'
import { UploadProvider, useUploads } from './UploadProvider'
import type { Put } from './upload'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const worker = vi.hoisted(() => ({ derive: vi.fn(), thumbnail: vi.fn() }))
vi.mock('#/viewer/pipeline', () => ({ deriveInWorker: worker.derive, thumbnailInWorker: worker.thumbnail }))

const okPut: Put = async () => ({ status: 200, etag: '"abc"' })
const step = (name = 'pump.step') => new File(['ISO-10303-21;\nHEADER;\nENDSEC;\n'], name)
const stats = { triangles: 4, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 3 } as const

const Probe = ({ file, files }: { file: File; files?: readonly File[] }) => {
  const uploads = useUploads()
  return (
    <>
      <button type="button" onClick={() => uploads.start(files ?? [file])}>go</button>
      <p data-testid="preparing">{[...uploads.preparing].join(',')}</p>
    </>
  )
}

const posts: string[] = []
const json = (body: unknown) => new Response(JSON.stringify({ ok: true, data: body }), { status: 200, headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  posts.length = 0
  worker.derive.mockReset()
  worker.thumbnail.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    posts.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/derivative/start')) return json({ sessionId: 's1', url: 'https://r2.test/glb', headers: {} })
    if (url === 'https://r2.test/glb') return new Response(null, { status: 200, headers: { etag: '"g"' } })
    return json({ state: 'ready', thumbnailAvailable: true })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('after an upload', () => {
  it('a STEP is converted in the Worker: "Preparing" and the leave warning while it runs, then GLB and thumbnail are stored', async () => {
    let finish: (outcome: DeriveOutcome) => void = () => {}
    worker.derive.mockImplementation(() => ({ result: new Promise((resolve) => (finish = resolve)), cancel: vi.fn() }))
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={step()} /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(screen.getByTestId('preparing')).toHaveTextContent(/^f-new-\d+$/))
    const id = screen.getByTestId('preparing').textContent
    await waitFor(() => expect(worker.derive).toHaveBeenCalledWith(expect.objectContaining({ format: 'step', name: 'pump.step', maxConvertBytes: 50 * 1024 * 1024 })))
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)

    await act(async () => finish({ ok: true, glb: new ArrayBuffer(20), thumbnail: new Blob(['t'], { type: 'image/webp' }), tree: { name: 'x', path: '0', mesh: null, matrix: null, children: [] }, stats }))
    await waitFor(() => expect(screen.getByTestId('preparing')).toHaveTextContent(''))
    expect(posts).toEqual([
      `POST /api/files/${id}/derivative/start`, 'PUT https://r2.test/glb', `POST /api/files/${id}/derivative/complete`,
      `POST /api/files/${id}/thumbnail?v=current&expect=1`,
    ])
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('two jobs for the same file: it stays Preparing (and warns on leave) until the last one ends', async () => {
    const finishers: Array<(outcome: DeriveOutcome) => void> = []
    // The second upload ends only once the first conversion is running: two jobs for f9, one after the other.
    let release: () => void = () => {}
    const firstRunning = new Promise<void>((resolve) => (release = resolve))
    worker.derive.mockImplementation(() => {
      release()
      return { result: new Promise((resolve) => finishers.push(resolve)), cancel: vi.fn() }
    })
    let puts = 0
    const gatedPut: Put = async (request) => (++puts === 1 ? okPut(request) : firstRunning.then(() => okPut(request)))
    let version = 0
    const { user } = renderApp(<UploadProvider put={gatedPut}><Probe file={step()} files={[step('a.step'), step('b.step')]} /></UploadProvider>, 'admin', (operation) =>
      operation === 'completeUpload' ? json({ fileId: 'f9', name: 'pump.step', extension: 'step', size: 30, versionNumber: ++version, isNewVersion: version > 1, maxConvertBytes: 1000 }) : undefined)
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(finishers).toHaveLength(1))
    await waitFor(() => expect(version).toBe(2))
    const failed = { ok: false, code: 'canceled' } as const
    await act(async () => finishers[0]?.(failed))
    await waitFor(() => expect(finishers).toHaveLength(2))
    expect(screen.getByTestId('preparing')).toHaveTextContent('f9')
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
    await act(async () => finishers[1]?.(failed))
    await waitFor(() => expect(screen.getByTestId('preparing')).toHaveTextContent(''))
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('a conversion whose GLB export failed stores only the thumbnail and records nothing', async () => {
    worker.derive.mockImplementation(() => ({
      result: Promise.resolve({ ok: true, glb: null, thumbnail: new Blob(['t'], { type: 'image/webp' }), tree: { name: 'x', path: '0', mesh: null, matrix: null, children: [] }, stats }),
      cancel: vi.fn(),
    }))
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={step()} /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(posts).toEqual([expect.stringMatching(/^POST \/api\/files\/f-new-\d+\/thumbnail\?v=current&expect=1$/)]))
  })

  it('a conversion that fails for the file is recorded with its code', async () => {
    worker.derive.mockImplementation(() => ({ result: Promise.resolve({ ok: false, code: 'empty' }), cancel: vi.fn() }))
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={step('blank.stp')} /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(posts).toEqual([expect.stringMatching(/^POST \/api\/files\/f-new-\d+\/derivative\/failed$/)]))
    await waitFor(() => expect(screen.getByTestId('preparing')).toHaveTextContent(''))
  })

  it('a source over maxConvertBytes is recorded as too_large without being read', async () => {
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={step()} /></UploadProvider>, 'admin', (operation) =>
      operation === 'completeUpload' ? json({ fileId: 'f9', name: 'pump.step', extension: 'step', size: 30, versionNumber: 1, isNewVersion: false, maxConvertBytes: 10 }) : undefined)
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(posts).toEqual(['POST /api/files/f9/derivative/failed']))
    expect(worker.derive).not.toHaveBeenCalled()
  })

  it('a phone converts nothing (the first desktop open does)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    vi.stubGlobal('screen', { width: 390, height: 844 })
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={step()} /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(worker.derive).not.toHaveBeenCalled()
    expect(posts).toEqual([])
  })

  it('an STL only gets its thumbnail', async () => {
    worker.thumbnail.mockImplementation(() => ({ result: Promise.resolve({ ok: true, blob: new Blob(['t'], { type: 'image/png' }) }), cancel: vi.fn() }))
    const bytes = new Uint8Array(84 + 50)
    new DataView(bytes.buffer).setUint32(80, 1, true)
    const { user } = renderApp(<UploadProvider put={okPut}><Probe file={new File([bytes], 'part.stl')} /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('button', { name: 'go' }))
    await waitFor(() => expect(posts).toEqual([expect.stringMatching(/^POST \/api\/files\/f-new-\d+\/thumbnail\?v=current&expect=1$/)]))
    expect(worker.derive).not.toHaveBeenCalled()
  })
})
