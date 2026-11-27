// @vitest-environment jsdom
/** While this tab's upload queue converts the file, the page shows Preparing and starts no second conversion. */
import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ViewerProps } from '#/viewer/Viewer.client'
import { FileDetailPage } from './FileDetailPage'
import { renderApp } from './testApp'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const seen = vi.hoisted(() => ({ props: [] as ViewerProps[] }))
vi.mock('#/viewer/Viewer.client', () => ({
  default: (props: ViewerProps) => {
    seen.props.push(props)
    return <section aria-label="3D view" />
  },
}))

// The upload queue, as the page sees it: only `preparing` changes here.
const uploads = vi.hoisted(() => ({ preparing: new Set<string>(), rerender: () => {} }))
vi.mock('./UploadProvider', async () => {
  const { useState, useEffect } = await import('react')
  return {
    UploadProvider: ({ children }: { children: ReactNode }) => children,
    UploadPill: () => null,
    useUploads: () => {
      const [, bump] = useState(0)
      useEffect(() => {
        uploads.rerender = () => bump((n) => n + 1)
      }, [])
      return { items: [], allowed: true, pick: () => {}, start: () => {}, setProject: () => {}, finished: 0, preparing: uploads.preparing }
    },
  }
})

const file = (model: Record<string, unknown>) => ({
  id: 'f1', name: 'Pump.step', extension: 'step', size: 12_400_000, projectId: null, projectName: null, createdAt: 1, updatedAt: 1,
  starred: false, thumbnailAvailable: false, currentVersion: { number: 2, uploadedBy: null }, access: { people: 0, link: 'none' },
  can: { comment: true, viewHistory: true, trash: false, share: false, edit: true, download: true }, model,
})
const answer = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
const source = { kind: 'source', bytes: 12_400_000, derivative: null, maxConvertBytes: 52_428_800 }
const glb = { kind: 'derivative', bytes: 3_000_000, derivative: { state: 'ready', code: null, parts: 4 }, maxConvertBytes: 52_428_800 }

beforeEach(() => {
  seen.props = []
  uploads.preparing = new Set(['f1'])
})

describe('file page while the upload queue prepares the file', () => {
  it('shows Preparing instead of a viewer that would convert it again, then opens the stored GLB', async () => {
    let model: Record<string, unknown> = source
    let reads = 0
    renderApp(<FileDetailPage />, 'admin', (op) => (op === 'getFile' ? (reads++, answer(file(model))) : undefined))
    expect(await screen.findByText('Preparing')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '3D view' })).not.toBeInTheDocument()
    expect(seen.props).toEqual([])
    const before = reads
    // The job stored the GLB and ended: the page reads the file again and opens it.
    model = glb
    uploads.preparing = new Set()
    await act(async () => uploads.rerender())
    await screen.findByRole('region', { name: '3D view' })
    expect(reads).toBeGreaterThan(before)
    await waitFor(() => expect(seen.props.at(-1)).toMatchObject({ source: 'derivative' }))
    expect(seen.props.every((p) => p.source === 'derivative')).toBe(true)
  })

  it('a recorded failure: Preparing stays until the reload answers, and the viewer opens on the failure without converting', async () => {
    let model: Record<string, unknown> = source
    let release: (() => void) | null = null
    renderApp(<FileDetailPage />, 'admin', (op) => {
      if (op !== 'getFile') return undefined
      const data = file(model)
      return model === source ? answer(data) : new Promise<Response>((resolve) => (release = () => resolve(answer(data))))
    })
    expect(await screen.findByText('Preparing')).toBeInTheDocument()
    // The job timed out and recorded it; the read that follows has not answered yet.
    model = { ...source, derivative: { state: 'failed', code: 'timeout', parts: null } }
    uploads.preparing = new Set()
    await act(async () => uploads.rerender())
    await waitFor(() => expect(release).not.toBeNull())
    expect(screen.getByText('Preparing')).toBeInTheDocument()
    expect(seen.props).toEqual([])
    await act(async () => release?.())
    await screen.findByRole('region', { name: '3D view' })
    expect(seen.props.length).toBeGreaterThan(0)
    expect(seen.props.every((p) => typeof p.start === 'object' && p.start.failed === 'timeout')).toBe(true)
  })

  it('another file being prepared does not hold this one', async () => {
    uploads.preparing = new Set(['f2'])
    renderApp(<FileDetailPage />, 'admin', (op) => (op === 'getFile' ? answer(file(source)) : undefined))
    await screen.findByRole('region', { name: '3D view' })
    expect(seen.props.at(-1)).toMatchObject({ source: 'source' })
  })
})
