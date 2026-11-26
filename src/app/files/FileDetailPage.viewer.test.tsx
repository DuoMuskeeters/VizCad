// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewerProps } from '#/viewer/Viewer.client'
import { FileDetailPage } from './FileDetailPage'
import { renderApp } from './testApp'
import { UploadProvider } from './UploadProvider'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

// The real viewer needs WebGL; here only what the page hands it matters.
const seen = vi.hoisted(() => ({ props: [] as ViewerProps[] }))
vi.mock('#/viewer/Viewer.client', () => ({
  default: (props: ViewerProps) => {
    seen.props.push(props)
    return <section aria-label="3D view" />
  },
}))

type Can = { edit: boolean; download: boolean }
const fileWith = (can: Can, extra: Record<string, unknown> = {}) => ({
  id: 'f1', name: 'Flanş_DN100_rev3.step', extension: 'step', size: 12_400_000, projectId: null, projectName: null, createdAt: 1, updatedAt: 1,
  starred: false, thumbnailAvailable: false, currentVersion: { number: 3, uploadedBy: null }, access: { people: 0, link: 'none' },
  can: { comment: true, viewHistory: true, trash: false, share: false, ...can },
  model: { kind: can.download ? 'source' : 'none', bytes: can.download ? 12_400_000 : null, derivative: null, maxConvertBytes: 52_428_800 }, ...extra,
})
const answer = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })

const posts: string[] = []
beforeEach(() => {
  seen.props = []
  posts.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    posts.push(url)
    return new Response('{"ok":true}', { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const last = () => seen.props.at(-1)!

describe('file page viewer', () => {
  it('reads the model endpoint with the file size; with edit and no thumbnail it stores the one the viewer renders', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: true, download: true })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ url: '/api/files/f1/model', size: 12_400_000, extension: 'step', name: 'Flanş_DN100_rev3.step' })
    expect(last().onThumbnail).toBeTypeOf('function')
    await act(async () => last().onThumbnail!(new Blob(['x'], { type: 'image/webp' })))
    await waitFor(() => expect(posts).toEqual(['/api/files/f1/thumbnail?v=current&expect=3']))
    // Stored: the page now shows it, and the viewer no longer asks for one.
    await waitFor(() => expect(last().thumbnailUrl).toBe('/api/files/f1/thumbnail?v=3'))
    expect(last().onThumbnail).toBeUndefined()
  })

  it('without edit no thumbnail is made (download alone may view, not write)', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: false, download: true })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last().onThumbnail).toBeUndefined()
    expect(last().onUploadVersion).toBeUndefined()
  })

  it('a file that has a thumbnail is not given another', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: true, download: true }, { thumbnailAvailable: true })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last().onThumbnail).toBeUndefined()
    expect(last().thumbnailUrl).toBe('/api/files/f1/thumbnail?v=3')
  })

  it('a thumbnail rendered from a version that is no longer current is dropped', async () => {
    let version = 3
    const { user } = renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) =>
      op === 'getFile' ? answer(fileWith({ edit: true, download: true }, { currentVersion: { number: version, uploadedBy: null } })) : undefined)
    await screen.findByRole('region', { name: '3D view' })
    const stale = last().onThumbnail!
    // Restoring version 2 makes it current as version 4; the viewer of version 3 may still hand its thumbnail over.
    version = 4
    await user.click(screen.getByRole('tab', { name: 'Versions' }))
    await user.click(await screen.findByRole('button', { name: 'Restore version 2' }))
    await waitFor(() => expect(last().thumbnailUrl === null && seen.props.some((p) => p.onThumbnail !== stale)).toBe(true))
    await waitFor(() => expect(screen.getByText('Version 2 is current again as a new version.')).toBeInTheDocument())
    await act(async () => stale(new Blob(['x'], { type: 'image/webp' })))
    expect(posts).toEqual([])
    // The current version's viewer may still store one.
    await act(async () => last().onThumbnail!(new Blob(['x'], { type: 'image/webp' })))
    await waitFor(() => expect(posts).toEqual(['/api/files/f1/thumbnail?v=current&expect=4']))
  })

  it('D23: a view-level caller opens the GLB derivative; nothing is converted or stored', async () => {
    const glb = { kind: 'derivative', bytes: 6_200_000, derivative: { state: 'ready', code: null, parts: 18 }, maxConvertBytes: 52_428_800 }
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: false, download: false }, { model: glb })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ url: '/api/files/f1/model', source: 'derivative', start: 'auto', modelBytes: 6_200_000 })
    expect(last().onDerivative).toBeUndefined()
    expect(last().onConvertFailed).toBeUndefined()
  })

  it('without a derivative a view-level caller gets the reason, not a viewer', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: false, download: false })) : undefined))
    expect(await screen.findByText('This file is not ready for 3D yet. It will be once its owner opens it.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '3D view' })).not.toBeInTheDocument()
  })

  it('lazy path: edit + download converts the source and stores its GLB for the version shown', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
      if (url.endsWith('/derivative/start')) return answer({ sessionId: 's1', url: 'https://r2.test/put', headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' } })
      if (url === 'https://r2.test/put') return new Response(null, { status: 200, headers: { etag: '"e1"' } })
      return answer({ state: 'ready' })
    }))
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: true, download: true })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ source: 'source', start: 'auto', retryAlways: false })
    const stats = { triangles: 10, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 5 } as const
    await act(async () => last().onDerivative!(new ArrayBuffer(24), stats))
    await waitFor(() => expect(calls.map((c) => c.url)).toEqual(['/api/files/f1/derivative/start', 'https://r2.test/put', '/api/files/f1/derivative/complete']))
    expect(calls[0]?.body).toEqual({ version: 3, size: 24 })
    expect(calls[2]?.body).toEqual({ sessionId: 's1', etag: '"e1"', stats: { converter: 'occt-import-js 0.0.23', triangles: 10, nodes: 2, parts: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] } } })
    await act(async () => last().onConvertFailed!('timeout'))
    await waitFor(() => expect(calls.at(-1)).toEqual({ url: '/api/files/f1/derivative/failed', body: { version: 3, code: 'timeout' } }))
  })

  it('a failed or too large derivative opens in its error state; only an edit user is offered the retry', async () => {
    const failed = { kind: 'source', bytes: 12_400_000, derivative: { state: 'failed', code: 'out_of_memory', parts: null }, maxConvertBytes: 52_428_800 }
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: true, download: true }, { model: failed })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ start: { failed: 'out_of_memory' }, retryAlways: true })
    expect(last().onDerivative).toBeTypeOf('function')
    cleanup()
    seen.props = []
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(fileWith({ edit: false, download: true }, { model: { ...failed, derivative: { state: 'too_large', code: 'too_large', parts: null } } })) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ start: { failed: 'too_large' }, retryAlways: false })
    expect(last().onDerivative).toBeUndefined()
  })
})
