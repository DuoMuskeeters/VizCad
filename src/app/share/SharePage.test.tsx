// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    expect(calls).toEqual([{ url: '/api/s/resolve', body: JSON.stringify({ token: TOKEN }) }])
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
    expect(calls.map((c) => c.url)).toEqual(['/api/s/resolve', '/api/s/password', '/api/s/password', '/api/s/resolve'])
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
