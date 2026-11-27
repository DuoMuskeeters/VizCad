// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../components/ui/test-utils'
import { I18nProvider } from '#/i18n'
import { UiProvider } from '#/components/ui/UiProvider'
import type { ViewerProps } from '#/viewer/Viewer.client'
import { formatSize } from './api'
import { SharePage } from './SharePage'

// The real viewer needs WebGL; here only what the page hands it matters.
const seen = vi.hoisted(() => ({ props: [] as ViewerProps[] }))
vi.mock('#/viewer/Viewer.client', () => ({
  default: (props: ViewerProps) => {
    seen.props.push(props)
    return <section aria-label="3D view" />
  },
}))
const last = () => seen.props.at(-1)

const TOKEN = 'A'.repeat(43)
const file = {
  name: 'Bracket.step', extension: 'step', size: 1536, updatedAt: 1, currentVersion: { number: 1 }, thumbnailAvailable: false,
  can: { download: true, comment: false as const }, sharer: { displayName: 'Ada', workspaceLabel: 'Acme' }, expiresAt: null,
  model: { kind: 'source', bytes: 1536, derivative: null, maxConvertBytes: 52_428_800 },
}
const glb = { kind: 'derivative', bytes: 6_200_000, derivative: { state: 'ready', code: null, parts: 3 }, maxConvertBytes: 52_428_800 }
const coarse = (on: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query === '(pointer: coarse)', media: query, addEventListener: () => {}, removeEventListener: () => {} }))

type Reply = { status: number; body: unknown }
const answer = (...replies: ReadonlyArray<Reply>) => {
  const calls: Array<{ url: string; body: string }> = []
  let i = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? '') })
    const reply = replies[Math.min(i++, replies.length - 1)] ?? { status: 500, body: {} }
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }))
  return calls
}

const mount = () => render(<I18nProvider><UiProvider><SharePage token={TOKEN} /></UiProvider></I18nProvider>)

afterEach(() => {
  vi.unstubAllGlobals()
  seen.props = []
})

describe('formatSize', () => {
  it.each([[0, '0 B'], [1023, '1023 B'], [1536, '1.5 KB'], [5 * 1024 * 1024, '5.0 MB'], [150 * 1024 * 1024, '150 MB']])('%d -> %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text)
  })
})

describe('SharePage', () => {
  it('applies the scene record of the shared model (Faz 5d): colours and hidden parts; saved views apply on this screen', async () => {
    const body = {
      v: 1, nodes: { '0.1': { color: '#b23a2e', at: 'Motor' }, '0.2': { hidden: true, at: 'Cover' } },
      views: [{ id: 'v1', name: 'Pump side', camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], fov: 40 }, hidden: ['0.1'] }],
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/scene')
        ? new Response(JSON.stringify({ ok: true, data: { scene: { revision: 2, body, updatedAt: 1, updatedBy: null }, previous: null, canEdit: false, maxViews: 20 } }), { status: 200 })
        : new Response(JSON.stringify({ ok: true, data: { kind: 'file', file: { ...file, model: glb } } }), { status: 200 })))
    mount()
    await screen.findByRole('region', { name: '3D view' })
    await waitFor(() => expect(last()?.studio?.view.looks.get('0.1')).toEqual({ color: '#b23a2e' }))
    expect([...last()!.studio!.view.hidden]).toEqual(['0.2'])
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === `/s/${TOKEN}/scene`)).toBe(true)
    const camera = vi.fn()
    const section = vi.fn()
    const view = vi.fn()
    last()!.studio!.api.current = { tools: async () => ({ camera: { set: camera }, section: { set: section, range: () => null, setScope: vi.fn() } }), view } as never
    // Before the model is open (a phone opens 3D on a tap) a view waits, and says why.
    const apply = screen.getByRole('button', { name: 'Apply the view Pump side' })
    expect(apply).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Open the 3D model to apply a view.')).toBeInTheDocument()
    fireEvent.click(apply)
    await act(async () => {})
    expect(camera).not.toHaveBeenCalled()
    expect([...last()!.studio!.view.hidden]).toEqual(['0.2'])
    act(() => last()!.studio!.onReady?.(true))
    expect(screen.queryByText('Open the 3D model to apply a view.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply the view Pump side' }))
    await waitFor(() => expect(camera).toHaveBeenCalledWith(body.views[0]!.camera))
    expect([...last()!.studio!.view.hidden]).toEqual(['0.1'])
    expect(screen.getByText('View “Pump side” applied.')).toHaveAttribute('role', 'status')
    // Back to the model as shared: the record's hidden parts, no cut, the whole model in view.
    fireEvent.click(screen.getByRole('button', { name: 'Back to the whole model' }))
    expect([...last()!.studio!.view.hidden]).toEqual(['0.2'])
    expect(view).toHaveBeenCalledWith('iso')
    await waitFor(() => expect(section).toHaveBeenLastCalledWith(null))
    expect(screen.queryByText('View “Pump side” applied.')).not.toBeInTheDocument()
    // A link never saves.
    expect(screen.queryByRole('button', { name: 'Save view' })).not.toBeInTheDocument()
  })

  it('a saved view with a part alone opens it alone: the camera after the viewer’s fit, the cut in the part’s range; reset clears it', async () => {
    const camera = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], fov: 40 }
    const body = { v: 1, nodes: {}, views: [{ id: 'v1', name: 'Pump alone', camera, isolated: '0.2', section: { normal: [-1, 0, 0], constant: 90 } }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/scene')
        ? new Response(JSON.stringify({ ok: true, data: { scene: { revision: 2, body, updatedAt: 1, updatedBy: null }, previous: null, canEdit: false, maxViews: 20 } }), { status: 200 })
        : new Response(JSON.stringify({ ok: true, data: { kind: 'file', file: { ...file, model: glb } } }), { status: 200 })))
    mount()
    await screen.findByRole('region', { name: '3D view' })
    let scope: string | null = null
    const setCamera = vi.fn()
    const section = vi.fn()
    const setScope = vi.fn((next: string | null) => {
      scope = next
    })
    const range = () => (scope === '0.2' ? { min: 80, max: 100 } : { min: 0, max: 100 })
    last()!.studio!.api.current = { tools: async () => ({ camera: { set: setCamera }, section: { set: section, range, setScope } }), view: vi.fn() } as never
    const part = (path: string) => ({ path, name: path, parts: 1, drawn: true, children: [] })
    act(() => {
      last()!.studio!.onReady?.(true)
      last()!.studio!.onOutline({ path: '0', name: 'Pump', parts: 3, drawn: false, children: [part('0.0'), part('0.1'), part('0.2')] })
    })
    let isolatedAtSet: string | null | undefined
    setCamera.mockImplementation(() => {
      isolatedAtSet = last()!.studio!.view.isolated
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Apply the view Pump alone' }))
    await waitFor(() => expect(setCamera).toHaveBeenCalledWith(camera))
    // Set once the viewer drew the isolation (and fitted to it), not before.
    expect(isolatedAtSet).toBe('0.2')
    expect(last()!.studio!.view.isolated).toBe('0.2')
    expect(section).toHaveBeenLastCalledWith(expect.objectContaining({ axis: 'x', position: 0.5 }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the whole model' }))
    expect(last()!.studio!.view.isolated).toBeNull()
    await waitFor(() => expect(section).toHaveBeenLastCalledWith(null))
    expect(setScope).toHaveBeenLastCalledWith(null)
  })

  it('shows the file card with a download link from the content route; the token only travels in the body', async () => {
    const calls = answer({ status: 200, body: { ok: true, data: { kind: 'file', file } } })
    mount()
    expect(await screen.findByRole('heading', { name: 'Bracket.step' })).toBeInTheDocument()
    expect(screen.getByText('Ada shared a file with you')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download · 1.5 KB' })).toHaveAttribute('href', `/s/${TOKEN}/content`)
    // A download link to a STEP without derivative: the viewer converts the source in place; nothing is stored.
    expect(await screen.findByRole('region', { name: '3D view' })).toBeInTheDocument()
    expect(last()).toMatchObject({ url: `/s/${TOKEN}/model`, source: 'source', start: 'auto' })
    expect(last()?.onDerivative).toBeUndefined()
    expect(screen.getByText(/recorded for Acme as “via link”/)).toBeInTheDocument()
    expect(calls.filter((c) => !c.url.endsWith('/scene'))).toEqual([{ url: '/api/s/resolve', body: JSON.stringify({ token: TOKEN }) }])
  })

  it('a GLB over the plan cap reads as the 3D view being too large, not "over 50 MB"; a source over the limit says the limit', async () => {
    const none = { kind: 'none', bytes: null, maxConvertBytes: 52_428_800 }
    const capped = { ...file, can: { download: false, comment: false }, model: { ...none, derivative: { state: 'too_large', code: 'glb_too_large', parts: null } } }
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: capped } } })
    const first = mount()
    expect(await screen.findByText('The 3D view of this file is too large to show in the browser.')).toBeInTheDocument()
    expect(screen.queryByText(/over 50 MB/)).not.toBeInTheDocument()
    first.unmount()
    const big = { ...capped, size: 60_000_000, model: { ...none, derivative: { state: 'too_large', code: 'too_large', parts: null } } }
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: big } } })
    mount()
    expect(await screen.findByText(/over 50 MB/)).toBeInTheDocument()
  })

  it('D23: a view link opens the GLB in 3D; on a phone only after “Open 3D · size”', async () => {
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: { ...file, can: { download: false, comment: false }, model: glb } } } })
    const first = mount()
    await screen.findByRole('region', { name: '3D view' })
    expect(last()).toMatchObject({ source: 'derivative', start: 'auto', modelBytes: 6_200_000 })
    expect(last()?.downloadAction).toBeUndefined()
    first.unmount()
    coarse(true)
    vi.stubGlobal('screen', { width: 390, height: 844 })
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: { ...file, can: { download: false, comment: false }, model: glb } } } })
    mount()
    await waitFor(() => expect(last()?.start).toBe('tap'))
  })

  it('a view link to a STEP without derivative shows the card and why there is no 3D', async () => {
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: { ...file, can: { download: false, comment: false }, model: { ...file.model, kind: 'none', bytes: null } } } } })
    mount()
    expect(await screen.findByText('This file is not ready for 3D yet. It will be once its owner opens it.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '3D view' })).toBeNull()
  })

  it('a view-only link has no download button', async () => {
    answer({ status: 200, body: { ok: true, data: { kind: 'file', file: { ...file, can: { download: false, comment: false } } } } })
    mount()
    expect(await screen.findByText('This file can only be viewed.')).toBeInTheDocument()
    expect(screen.getByText(/ask Ada for download access/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull()
  })

  it('the password can be shown and hidden, and the gate says whom to ask', async () => {
    answer({ status: 200, body: { ok: true, data: { kind: 'password' } } })
    mount()
    const input = await screen.findByLabelText('Password')
    const user = userEvent.setup()
    await user.type(input, 'secret-one-1')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByText('If you do not know the password, ask the person who sent you the link.')).toBeInTheDocument()
  })

  it('a password link shows only the gate; a wrong password says so, the right one opens the card (password in the body only)', async () => {
    const calls = answer(
      { status: 200, body: { ok: true, data: { kind: 'password' } } },
      { status: 401, body: { ok: false, error: 'LinkPasswordInvalid', captchaRequired: false } },
      { status: 200, body: { ok: true, data: { verified: true } } },
      { status: 200, body: { ok: true, data: { kind: 'file', file } } },
    )
    mount()
    const input = await screen.findByLabelText('Password')
    expect(screen.queryByText('Bracket.step')).toBeNull()
    const user = userEvent.setup()
    await user.type(input, 'wrong one 1')
    await user.click(screen.getByRole('button', { name: 'Open file' }))
    expect(await screen.findByText('That password is not right.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'right one 1')
    await user.click(screen.getByRole('button', { name: 'Open file' }))
    expect(await screen.findByRole('heading', { name: 'Bracket.step' })).toBeInTheDocument()
    expect(calls.map((c) => c.url).filter((u) => !u.endsWith('/scene'))).toEqual(['/api/s/resolve', '/api/s/password', '/api/s/password', '/api/s/resolve'])
    expect(calls.every((c) => !c.url.includes('password=') && !c.url.includes('right'))).toBe(true)
    expect(JSON.parse(calls[2]?.body ?? '{}')).toEqual({ token: TOKEN, password: 'right one 1' })
  })

  it.each([
    [{ status: 404, body: { ok: false, error: 'LinkUnavailable' } }, 'This link is no longer valid'],
    [{ status: 410, body: { ok: false, error: 'LinkExpired', sharer: 'Ada' } }, 'This link has expired'],
  ])('explains a refused link (%j)', async (reply, title) => {
    answer(reply)
    mount()
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })

  it('names the sharer of an expired link and can retry a network failure', async () => {
    answer({ status: 410, body: { ok: false, error: 'LinkExpired', sharer: 'Ada' } })
    const first = mount()
    expect(await screen.findByText('Ask Ada for a new link.')).toBeInTheDocument()
    first.unmount()
    answer({ status: 500, body: { ok: false, error: 'InternalError' } }, { status: 200, body: { ok: true, data: { kind: 'file', file } } })
    mount()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Bracket.step' })).toBeInTheDocument()
  })
})
