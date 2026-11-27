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

const seen = vi.hoisted(() => ({ props: [] as ViewerProps[], stl: [] as unknown[][], thumbs: [] as string[], tools: null as unknown }))
vi.mock('#/viewer/Viewer.client', () => ({
  default: (props: ViewerProps) => {
    seen.props.push(props)
    if (props.studio) {
      props.studio.api.current = {
        // No image (as for a node without geometry): the card must not spin.
        thumbnail: async (path: string) => {
          seen.thumbs.push(path)
          return null
        },
        sizeOf: () => [420, 248, 372],
        colorOf: () => '#888888',
        triangles: async () => 48210,
        exportStl: async (...args: unknown[]) => {
          seen.stl.push(args)
          return new Blob(['solid'])
        },
        tools: async () => seen.tools as never,
      }
    }
    return (
      <section aria-label="3D view" hidden={props.hidden}>
        {props.overlay}
        {props.toolbar?.({
          ready: true, stats: null, wireframe: false, edges: false, edgesAvailable: true,
          fit: () => {}, view: () => {}, toggleWireframe: () => {}, toggleEdges: () => {},
        })}
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
const open = async (data: Omit<typeof file, 'model'> & { model: unknown } = file) => {
  const rendered = renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? answer(data) : undefined))
  await screen.findByRole('region', { name: '3D view', hidden: true })
  act(() => {
    last().studio!.onReady?.(true)
    last().studio!.onOutline(outline)
  })
  return rendered
}

type Answer = { scene: unknown; previous: unknown; canEdit: boolean; maxViews: number }
const server = vi.hoisted(() => ({ answer: null as unknown, writes: [] as unknown[], writeStatus: 200, reads: 0 }))
const stubScene = (answer: Answer) => {
  server.answer = answer
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.endsWith('/scene')) return new Response('{}', { status: 404 })
    if (init?.method === 'POST') {
      server.writes.push(JSON.parse(String(init.body)))
      return server.writeStatus === 200
        ? new Response(JSON.stringify({ ok: true, data: { revision: server.writes.length, updatedAt: 1 } }), { status: 200 })
        : server.writeStatus === 500
          ? new Response(JSON.stringify({ ok: false, error: 'Internal' }), { status: 500 })
          : new Response(JSON.stringify({ ok: false, error: 'SceneConflict' }), { status: 409 })
    }
    server.reads++
    return new Response(JSON.stringify({ ok: true, data: server.answer }), { status: 200 })
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  server.writes = []
  server.writeStatus = 200
  server.reads = 0
  seen.stl = []
  seen.thumbs = []
  seen.props = []
  seen.tools = null
  router.search = {}
  router.navigate.mockReset()
  vi.unstubAllGlobals()
})

/** A phone-wide screen: `useWide` reads `(min-width: 900px)`. */
const narrow = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))

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
    expect(within(folder).getByText(/This level has 2 sub-assemblies and 1 part\./)).toBeInTheDocument()
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

  it('opens a part link in the Parts view at its parent level, not as an empty level', async () => {
    router.search = { view: 'parts', node: '0.1.1' }
    await open()
    const folder = screen.getByRole('region', { name: 'Parts' })
    expect(within(folder).getByRole('heading', { name: 'Sub-assembly · 2 parts' })).toBeInTheDocument()
    expect(within(folder).getByText('Stator')).toBeInTheDocument()
    expect(within(folder).getByText('Fan')).toBeInTheDocument()
  })

  it('on a phone, opens the parts sheet of an isolated part at its parent level and offers Show all', async () => {
    narrow()
    router.search = { node: '0.1.1' }
    const { user } = await open()
    const tools = screen.getByRole('toolbar', { name: 'Studio tools' })
    await user.click(within(tools).getByRole('button', { name: 'Parts' }))
    const sheet = screen.getByRole('region', { name: 'Parts tree' })
    expect(within(sheet).getByText('Stator')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Hide Stator' }))
    expect([...last().studio!.view.hidden]).toEqual(['0.1.0'])
    await user.click(within(sheet).getByRole('button', { name: 'Show all' }))
    expect(last().studio!.view.hidden.size).toBe(0)
  })

  it('moves the 3D / Parts switch to a second row on a phone', async () => {
    narrow()
    await open()
    // One switch in the top bar (hidden below 360 px by CSS), one in the second row (hidden from 360 px).
    expect(screen.getAllByRole('navigation', { name: 'View' })).toHaveLength(2)
  })

  it('offers Show all while a part is isolated, and isolating a hidden part shows it again', async () => {
    const { user } = await open()
    const tree = screen.getByRole('tree', { name: 'Parts tree' })
    await user.click(within(tree).getByRole('button', { name: 'Hide Pump unit' }))
    await user.click(within(tree).getByRole('button', { name: 'Hide Frame' }))
    router.search = { node: '0.2' }
    // Any change re-renders the page, which reads the new search.
    act(() => last().studio!.onPick('0.2.0'))
    await waitFor(() => expect(last().studio!.view.isolated).toBe('0.2'))
    await waitFor(() => expect([...last().studio!.view.hidden]).toEqual(['0.0']))
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(last().studio!.view.hidden.size).toBe(0)
  })

  it('hiding the isolated part leaves the isolation and stays hidden (no local override)', async () => {
    router.search = { node: '0.2' }
    const { user } = await open()
    await waitFor(() => expect(last().studio!.view.isolated).toBe('0.2'))
    act(() => last().studio!.onPick('0.2'))
    const bar = await screen.findByRole('toolbar', { name: /Pump unit/ })
    await user.click(within(bar).getByRole('button', { name: /^Hide/ }))
    expect(router.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: {} }))
    // Still isolated until the URL changes: the hide is not undone meanwhile.
    expect(last().studio!.view.hidden.has('0.2')).toBe(true)
  })

  it('has a skip link and a main region while the file loads', async () => {
    renderApp(<UploadProvider><FileDetailPage /></UploadProvider>, 'admin', (op) => (op === 'getFile' ? new Promise<Response>(() => {}) : undefined))
    const skip = await screen.findByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

describe('scene prep (5c-2)', () => {
  const editable: Answer = { scene: null, previous: null, canEdit: true, maxViews: 20 }

  it('an editor colours a part; the change applies at once and is saved after a pause, with its name path', async () => {
    stubScene(editable)
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Motor'))
    await waitFor(() => expect(server.reads).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Edit appearance' }))
    expect(screen.getByText('You are editing the appearance.')).toBeInTheDocument()
    const panel = screen.getByRole('region', { name: 'Edit appearance' })
    await user.click(within(panel).getByRole('button', { name: 'Red' }))
    expect(last().studio!.view.looks.get('0.1')).toEqual({ color: '#b23a2e', finish: undefined })
    await waitFor(() => expect(server.writes).toHaveLength(1), { timeout: 3000 })
    expect(server.writes[0]).toEqual({ version: 4, revision: 0, body: { v: 1, nodes: { '0.1': { color: '#b23a2e', at: 'Motor' } }, views: [] } })
    await waitFor(() => expect(within(panel).getByText('Saved')).toBeInTheDocument())
    // Hidden for everyone: the visible switch writes the record.
    await user.click(within(panel).getByRole('switch', { name: 'Visible' }))
    expect(last().studio!.view.hidden.has('0.1')).toBe(true)
    await waitFor(() => expect(server.writes).toHaveLength(2), { timeout: 3000 })
    expect(server.writes[1]).toMatchObject({ revision: 1, body: { nodes: { '0.1': { color: '#b23a2e', hidden: true } } } })
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('region', { name: 'Edit appearance' })).not.toBeInTheDocument()
  }, 10_000)

  it('hiding the isolated part for everyone leaves the isolation; no local "shown" override is added', async () => {
    stubScene(editable)
    router.search = { node: '0.1' }
    const { user } = await open()
    await waitFor(() => expect(server.reads).toBe(1))
    act(() => last().studio!.onPick('0.1'))
    await user.click(screen.getByRole('button', { name: 'Edit appearance' }))
    await user.click(within(screen.getByRole('region', { name: 'Edit appearance' })).getByRole('switch', { name: 'Visible' }))
    expect(router.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: {} }))
    expect(last().studio!.view.hidden.has('0.1')).toBe(true)
  })

  it('a ?node= part hidden by a record that arrives after the tree is shown again', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    stubScene({ ...editable, scene: { revision: 2, body: { v: 1, nodes: { '0.2': { hidden: true } }, views: [] }, updatedAt: 1, updatedBy: null } })
    const answered = vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      await gate
      return answered(url, init)
    }))
    router.search = { node: '0.2' }
    await open()
    await waitFor(() => expect(last().studio!.view.isolated).toBe('0.2'))
    expect(server.reads).toBe(0)
    await act(async () => release())
    await waitFor(() => expect(server.reads).toBe(1))
    await waitFor(() => expect(last().studio!.view.hidden.has('0.2')).toBe(false))
    expect(last().studio!.view.isolated).toBe('0.2')
  })

  it('a stale revision stops saving and offers a reload of the current record', async () => {
    stubScene(editable)
    server.writeStatus = 409
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Motor'))
    await user.click(screen.getByRole('button', { name: 'Edit appearance' }))
    await user.click(within(screen.getByRole('region', { name: 'Edit appearance' })).getByRole('button', { name: 'Blue' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Someone else changed this appearance.')
    server.answer = { ...editable, scene: { revision: 7, body: { v: 1, nodes: { '0.0': { color: '#ffffff' } }, views: [] }, updatedAt: 1, updatedBy: 'Zeynep' } }
    await user.click(within(alert).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(last().studio!.view.looks.get('0.0')).toEqual({ color: '#ffffff', finish: undefined }))
    expect(last().studio!.view.looks.has('0.1')).toBe(false)
  }, 10_000)

  it('editing waits until the earlier colours are applied or ignored', async () => {
    stubScene({ ...editable, previous: { versionNumber: 3, body: { v: 1, nodes: { '0.4': { color: '#2f5f99', at: 'Motor' } }, views: [] } } })
    const { user } = await open()
    await screen.findByText('Apply the colours and names of version 3?')
    const edit = screen.getByRole('button', { name: 'Edit appearance' })
    expect(edit).toHaveAttribute('aria-disabled', 'true')
    await user.click(edit)
    expect(screen.queryByText('You are editing the appearance.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ignore' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit appearance' })).not.toHaveAttribute('aria-disabled'))
  })

  it('an offer that turns up while editing (the record read again) closes the editor until it is answered', async () => {
    stubScene(editable)
    server.writeStatus = 409
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Motor'))
    await waitFor(() => expect(server.reads).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Edit appearance' }))
    await user.click(within(screen.getByRole('region', { name: 'Edit appearance' })).getByRole('button', { name: 'Blue' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    server.answer = { ...editable, previous: { versionNumber: 3, body: { v: 1, nodes: { '0.4': { color: '#2f5f99', at: 'Motor' } }, views: [] } } }
    await user.click(within(alert).getByRole('button', { name: 'Reload' }))
    await screen.findByText('Apply the colours and names of version 3?')
    expect(screen.queryByText('You are editing the appearance.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Edit appearance' })).not.toBeInTheDocument()
  }, 10_000)

  it('a change that did not save stays visible after Done, with a retry', async () => {
    stubScene(editable)
    server.writeStatus = 500
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Motor'))
    await waitFor(() => expect(server.reads).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Edit appearance' }))
    await user.click(within(screen.getByRole('region', { name: 'Edit appearance' })).getByRole('button', { name: 'Blue' }))
    await waitFor(() => expect(server.writes).toHaveLength(1), { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: 'Done' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Appearance changes are not saved.')
    server.writeStatus = 200
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(server.writes).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('Appearance changes are not saved.')).not.toBeInTheDocument())
  }, 10_000)

  it('a new version offers the previous colours by name path: apply writes the matched entries', async () => {
    stubScene({
      ...editable,
      previous: { versionNumber: 3, body: { v: 1, nodes: { '0.4': { color: '#2f5f99', at: 'Motor' }, '0.5': { color: '#000000', at: 'Gone' } }, views: [] } },
    })
    const { user } = await open()
    const banner = await screen.findByText('Apply the colours and names of version 3?')
    expect(banner.parentElement).toHaveTextContent('1 part matched, 1 did not.')
    await user.click(screen.getByRole('button', { name: 'Unmatched' }))
    expect(screen.getByRole('region', { name: 'Parts that did not match' })).toHaveTextContent('Gone')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(server.writes).toEqual([{ version: 4, revision: 0, body: { v: 1, nodes: { '0.1': { color: '#2f5f99', at: 'Motor' } }, views: [] } }]))
    await waitFor(() => expect(screen.queryByText('Apply the colours and names of version 3?')).not.toBeInTheDocument())
  })

  it('a reader sees the record applied (names, colours, hidden) and cannot edit; their eye overrides only their screen', async () => {
    stubScene({ scene: { revision: 2, body: { v: 1, nodes: { '0.1': { name: 'Electric motor', color: '#3f7d4e' }, '0.0': { hidden: true } }, views: [] }, updatedAt: 1, updatedBy: 'Ada' }, previous: null, canEdit: false, maxViews: 20 })
    const { user } = await open({ ...file, can: { ...file.can, edit: false } })
    const tree = screen.getByRole('tree', { name: 'Parts tree' })
    expect(await within(tree).findByText('Electric motor')).toBeInTheDocument()
    expect(last().studio!.view.hidden.has('0.0')).toBe(true)
    await user.click(within(tree).getByRole('button', { name: 'Show Frame' }))
    expect(last().studio!.view.hidden.has('0.0')).toBe(false)
    expect(server.writes).toEqual([])
    await user.click(within(tree).getByText('Electric motor'))
    const edit = screen.getByRole('button', { name: 'Edit appearance' })
    expect(edit).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Only people who can edit the file change its appearance.')).toBeInTheDocument()
  })

  it('after the lazy conversion stores the GLB, the record is read again: Edit opens and the banner shows, no file reload', async () => {
    let stored = false
    const previous = { versionNumber: 3, body: { v: 1, nodes: { '0.4': { color: '#2f5f99', at: 'Motor' } }, views: [] } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/scene')) {
        server.reads++
        return answer(stored ? { ...editable, previous } : { scene: null, previous: null, canEdit: false, maxViews: 20 })
      }
      if (url.endsWith('/derivative/start')) return answer({ sessionId: 's1', url: 'https://r2.test/put', headers: {} })
      if (url === 'https://r2.test/put') return new Response(null, { status: 200, headers: { etag: '"e1"' } })
      stored = true
      return answer({})
    }))
    const source = { ...file, model: { kind: 'source', bytes: 12_400_000, derivative: null, maxConvertBytes: 52_428_800 } }
    const { calls, user } = await open(source)
    await waitFor(() => expect(server.reads).toBe(1))
    expect(screen.getByRole('button', { name: 'Edit appearance' })).toHaveAttribute('aria-disabled', 'true')
    const reads = calls.filter((c) => c.operation === 'getFile').length
    const stats = { triangles: 10, nodes: 6, parts: 5, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, ms: 5 } as const
    await act(async () => last().onDerivative!(new ArrayBuffer(24), stats))
    expect(await screen.findByText('Apply the colours and names of version 3?')).toBeInTheDocument()
    expect(server.reads).toBe(2)
    expect(calls.filter((c) => c.operation === 'getFile').length).toBe(reads)
    expect(last().source).toBe('source')
    await user.click(screen.getByRole('button', { name: 'Ignore' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit appearance' })).not.toHaveAttribute('aria-disabled'))
  })

  it('folder thumbnails: a part without an image never spins, and the record\'s colours draw them again', async () => {
    let releaseRead = () => {}
    const read = new Promise<void>((resolve) => (releaseRead = resolve))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.endsWith('/scene')) return new Response('{}', { status: 404 })
      await read
      return answer({ scene: { revision: 1, body: { v: 1, nodes: { '0.0': { color: '#ffffff' } }, views: [] }, updatedAt: 1, updatedBy: null }, previous: null, canEdit: false, maxViews: 20 })
    }))
    router.search = { view: 'parts' }
    await open()
    const folder = screen.getByRole('region', { name: 'Parts' })
    await waitFor(() => expect(seen.thumbs).toEqual(['0.0', '0.1', '0.2']))
    await waitFor(() => expect(within(folder).queryByText(/Drawing/)).not.toBeInTheDocument())
    releaseRead()
    await waitFor(() => expect(seen.thumbs).toEqual(['0.0', '0.1', '0.2', '0.0', '0.1', '0.2']))
  })

  it('downloads a part as STL in its place by default, centred on request (B7)', async () => {
    stubScene(editable)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    const { user } = await open()
    await user.click(within(screen.getByRole('tree', { name: 'Parts tree' })).getByText('Pump unit'))
    await user.click(screen.getAllByRole('button', { name: 'Download as STL' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Download the part as STL' })
    expect(await within(dialog).findByText('48,210')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /Centred on the origin/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Download STL' }))
    await waitFor(() => expect(seen.stl).toEqual([['0.2', true, 'Pump unit']]))
  })
})

describe('comment pins on the file page', () => {
  it('a pin placed on the canvas is sent with the version open on the screen', async () => {
    const tools = {
      section: { set: vi.fn(), range: vi.fn(() => ({ min: 0, max: 100 })), onDrag: vi.fn(() => () => {}), setScope: vi.fn(), setCovered: vi.fn() },
      measure: { start: vi.fn(), stop: vi.fn(), remove: vi.fn(), clear: vi.fn(), subscribe: vi.fn(() => () => {}) },
      pins: { set: vi.fn(), start: vi.fn(), stop: vi.fn(), onSelect: vi.fn(() => () => {}) },
      camera: { get: vi.fn(), set: vi.fn() },
      setLabels: vi.fn(),
      screenshot: vi.fn(),
      dispose: vi.fn(),
    }
    seen.tools = tools
    stubScene({ scene: null, previous: null, canEdit: true, maxViews: 20 })
    const { user, calls } = await open()
    await user.click(screen.getByRole('tab', { name: /Comments/ }))
    await user.click(await screen.findByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(tools.pins.start).toHaveBeenCalled())
    const placed = tools.pins.start.mock.lastCall![0] as unknown as (pin: { path: string; point: [number, number, number] }) => void
    act(() => placed({ path: '0.2.0', point: [1, 2, 3] }))
    await user.type(screen.getByRole('textbox', { name: 'Write a comment' }), 'Check this bolt')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'addComment')?.body['anchor']).toEqual({ v: 1, path: '0.2.0', point: [1, 2, 3], version: 4 }))
  })
})

describe('saved views (docs/11 §3.1)', () => {
  const camera = { position: [300, -300, 240] as const, target: [10, 0, 0] as const, up: [0, 0, 1] as const, fov: 35 }
  const fakeTools = () => ({
    section: { set: vi.fn(), range: vi.fn(() => ({ min: 0, max: 100 })), onDrag: vi.fn(() => () => {}), setScope: vi.fn(), setCovered: vi.fn() },
    measure: { start: vi.fn(), stop: vi.fn(), remove: vi.fn(), clear: vi.fn(), subscribe: vi.fn(() => () => {}) },
    pins: { set: vi.fn(), start: vi.fn(), stop: vi.fn(), onSelect: vi.fn(() => () => {}) },
    camera: { get: vi.fn(() => camera), set: vi.fn() },
    setLabels: vi.fn(),
    screenshot: vi.fn(),
    dispose: vi.fn(),
  })
  const saved = { id: 'v1', name: 'Pump side', camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], fov: 40 }, hidden: ['0.1'], section: { normal: [-1, 0, 0], constant: 25 } }

  it('applies a saved view (camera, cut, hidden on this screen) and saves the current one on a desktop', async () => {
    const tools = fakeTools()
    seen.tools = tools
    stubScene({ scene: { revision: 3, body: { v: 1, nodes: {}, views: [saved] }, updatedAt: 1, updatedBy: null }, previous: null, canEdit: true, maxViews: 20 })
    const { user } = await open()
    const views = await screen.findByRole('region', { name: 'Saved views' })
    await user.click(within(views).getByRole('button', { name: 'Apply the view Pump side' }))
    await waitFor(() => expect(tools.camera.set).toHaveBeenCalledWith(saved.camera))
    expect([...last().studio!.view.hidden]).toEqual(['0.1'])
    await waitFor(() => expect(tools.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ axis: 'x', position: 0.25, flipped: false })))
    await user.type(within(views).getByRole('textbox', { name: 'View name' }), 'Top')
    await user.click(within(views).getByRole('button', { name: 'Save view' }))
    await waitFor(() => expect(server.writes).toHaveLength(1))
    const body = (server.writes[0] as { body: { views: Array<{ name: string; camera: unknown; hidden?: string[]; section?: unknown }> } }).body
    expect(body.views.map((v) => v.name)).toEqual(['Pump side', 'Top'])
    expect(body.views[1]).toMatchObject({ camera, hidden: ['0.1'], section: { normal: [-1, 0, 0], constant: 25 } })
  })

  it('on a phone: apply only (no save form), also from the More menu', async () => {
    narrow()
    const tools = fakeTools()
    seen.tools = tools
    stubScene({ scene: { revision: 3, body: { v: 1, nodes: {}, views: [saved] }, updatedAt: 1, updatedBy: null }, previous: null, canEdit: true, maxViews: 20 })
    const { user } = await open()
    const views = await screen.findByRole('region', { name: 'Saved views' })
    expect(within(views).queryByRole('button', { name: 'Save view' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('toolbar', { name: 'Studio tools' })).getByRole('button', { name: 'More tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pump side' }))
    await waitFor(() => expect(tools.camera.set).toHaveBeenCalledWith(saved.camera))
  })
})
