// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewerProps } from '#/viewer/Viewer.client'
import type { OutlineNode } from '#/viewer/tree/outline'
import { FileDetailPage } from './FileDetailPage'
import { renderApp } from './testApp'
import { UploadProvider } from './UploadProvider'

const router = vi.hoisted(() => ({ search: {} as Record<string, unknown>, navigate: vi.fn() }))
vi.mock('@tanstack/react-router', async () => {
  const { routerMock } = await import('./routerMock')
  return { ...routerMock, useSearch: () => router.search, useNavigate: () => router.navigate }
})

const seen = vi.hoisted(() => ({ props: [] as ViewerProps[] }))
vi.mock('#/viewer/Viewer.client', () => ({
  default: (props: ViewerProps) => {
    seen.props.push(props)
    return (
      <section aria-label="3D view" hidden={props.hidden}>
        {props.overlay}
        <div role="toolbar" aria-label="Viewer tools">
          {props.toolbarStart}
        </div>
      </section>
    )
  },
}))

const part = (path: string, name: string): OutlineNode => ({ path, name, parts: 1, drawn: true, children: [] })
const asm = (path: string, name: string, children: OutlineNode[]): OutlineNode => ({ path, name, drawn: false, children, parts: children.reduce((n, c) => n + c.parts, 0) })
const outline = asm('0', 'Pump group', [
  part('0.0', 'Frame'),
  asm('0.1', 'Motor', [part('0.1.0', 'Stator'), part('0.1.1', 'Fan')]),
  asm('0.2', 'Pump unit', [part('0.2.0', 'Volute'), part('0.2.1', 'Impeller')]),
])

const file = {
  id: 'f1', name: 'Pump.step', extension: 'step', size: 12_400_000, projectId: null, projectName: null, createdAt: 1, updatedAt: 1,
  starred: false, thumbnailAvailable: false, currentVersion: { number: 4, uploadedBy: null }, access: { people: 0, link: 'none' },
  can: { edit: true, comment: true, download: true, viewHistory: true, trash: false, share: false },
  model: { kind: 'derivative', bytes: 4_000_000, derivative: { state: 'ready', code: null, parts: 5 }, maxConvertBytes: 52_428_800 },
}
const answer = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })

const last = () => seen.props.at(-1)!
const open = async () => {
  const rendered = renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(file) : undefined))
  await screen.findByRole('region', { name: '3D view', hidden: true })
  act(() => {
    last().studio!.onReady?.(true)
    last().studio!.onOutline(outline)
  })
  return rendered
}

beforeEach(() => {
  seen.props = []
  router.search = {}
  router.navigate.mockReset()
})

describe('assembly studio on the file page', () => {
  it('shows the tree, selects from it and from the canvas, and hides on this screen only (B2)', async () => {
    const { user } = await open()
    const tree = screen.getByRole('tree', { name: 'Parts tree' })
    expect(within(tree).getByText('Pump group')).toBeInTheDocument()
    expect(within(tree).getByText('Motor')).toBeInTheDocument()
    await user.click(within(tree).getByText('Motor'))
    expect(last().studio!.view.selected).toBe('0.1')
    const bar = screen.getByRole('toolbar', { name: 'Selected: Motor' })
    expect(within(bar).getByRole('button', { name: 'Open only this' })).toBeInTheDocument()
    // The canvas picks a part: its row opens and is selected.
    act(() => last().studio!.onPick('0.2.1'))
    expect(within(tree).getByRole('treeitem', { name: /Impeller/, selected: true })).toBeInTheDocument()
    await user.click(within(tree).getByRole('button', { name: 'Hide Impeller' }))
    expect([...last().studio!.view.hidden]).toEqual(['0.2.1'])
    expect(screen.getByText('5 parts · 1 hidden')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(last().studio!.view.hidden.size).toBe(0)
    // Nothing is written: no request beyond reading the file.
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('isolates through ?node=, shows the path bar and returns to the whole assembly', async () => {
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Pump unit'))
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected: Pump unit' })).getByRole('button', { name: 'Open only this' }))
    expect(router.navigate).toHaveBeenLastCalledWith({ to: '/app/files/$id', params: { id: 'f1' }, search: { node: '0.2' } })
    router.search = { node: '0.2' }
    act(() => last().studio!.onPick(null))
    await waitFor(() => expect(last().studio!.view.isolated).toBe('0.2'))
    const path = screen.getByRole('navigation', { name: 'Isolated part' })
    expect(within(path).getByText('Pump unit')).toHaveAttribute('aria-current', 'location')
    await user.click(within(path).getAllByRole('button', { name: 'Whole assembly' })[0]!)
    expect(router.navigate).toHaveBeenLastCalledWith({ to: '/app/files/$id', params: { id: 'f1' }, search: {} })
  })

  it('ignores a ?node= that is not in this version and says so', async () => {
    router.search = { node: '0.9.3' }
    await open()
    expect(last().studio!.view.isolated).toBeNull()
    expect(screen.getByText('This part is not in the current version of the file.')).toBeInTheDocument()
  })

  it('opens the Parts view as a folder: band, levels through ?node=, and back to 3D with a part selected', async () => {
    router.search = { view: 'parts' }
    const { user } = await open()
    const folder = screen.getByRole('region', { name: 'Parts' })
    expect(within(folder).getByRole('heading', { name: 'Assembly · 5 parts' })).toBeInTheDocument()
    expect(within(folder).getByText(/This level has 2 sub-assemblies and 1 parts/)).toBeInTheDocument()
    expect(last().hidden).toBe(true)
    await user.click(within(folder).getByRole('button', { name: 'Open Motor' }))
    expect(router.navigate).toHaveBeenLastCalledWith({ to: '/app/files/$id', params: { id: 'f1' }, search: { view: 'parts', node: '0.1' } })
    await user.click(within(folder).getByRole('button', { name: 'Frame. Show in assembly' }))
    expect(last().studio!.view.selected).toBe('0.0')
    expect(router.navigate).toHaveBeenLastCalledWith({ to: '/app/files/$id', params: { id: 'f1' }, search: {} })
    // Thumbnails are asked of the open model, one by one.
    expect(seen.props.some((p) => p.studio?.api !== undefined)).toBe(true)
  })

  it('a single part file gets no tree and no Parts view (A4)', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer({ ...file, model: { ...file.model, derivative: { state: 'ready', code: null, parts: 1 } } }) : undefined))
    await screen.findByRole('region', { name: '3D view', hidden: true })
    act(() => {
      last().studio!.onReady?.(true)
      last().studio!.onOutline(asm('0', 'Bracket', [part('0.0', 'Bracket')]))
    })
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'View' })).not.toBeInTheDocument()
  })
})
