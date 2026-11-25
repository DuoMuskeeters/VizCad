// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ShareDialog } from './ShareDialog'
import { renderApp } from './testApp'
import type { FileView } from './types'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const file: FileView = {
  id: 'f1', name: 'Flanş_DN100_rev3.step', extension: 'step', size: 12_400_000, projectId: null, projectName: null, createdAt: 1, updatedAt: 2, starred: false,
  thumbnailAvailable: false, currentVersion: { number: 3, uploadedBy: { displayName: 'Ayşe Yılmaz' } }, access: { people: 0, link: 'none' },
  can: { edit: true, comment: true, download: true, viewHistory: true, trash: true, share: true },
}

const open = (scenario = 'admin') => renderApp(<ShareDialog file={file} workspaceId="ws-dm" onClose={() => undefined} />, scenario)

const dialog = async () => within(await screen.findByRole('dialog'))

describe('people', () => {
  it('gives a team member the chosen level with no end date', async () => {
    const { calls, user } = open()
    const d = await dialog()
    await user.type(await d.findByRole('textbox', { name: 'Add a person or email' }), 'Zeynep')
    await user.click(await d.findByRole('button', { name: /Zeynep Arslan/ }))
    await user.click(d.getByRole('combobox', { name: 'Access' }))
    await user.click(await screen.findByRole('option', { name: 'Can download' }))
    await user.click(d.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'grantFileAccess')?.body).toEqual({ workspaceId: 'ws-dm', fileId: 'f1', userId: 'u-zeynep', level: 'download', expiresAt: null }))
    expect(await d.findByText('Zeynep Arslan')).toBeInTheDocument()
  })

  it('a guest needs an end date: the date is sent as accessExpiresAt and a past date is refused', async () => {
    const { calls, user } = open()
    const d = await dialog()
    await user.type(await d.findByRole('textbox', { name: 'Add a person or email' }), 'satinalma@yildiztorna.com')
    await user.click(await d.findByRole('button', { name: /Invite satinalma@yildiztorna.com as a guest/ }))
    expect(d.getByText('Guests need an end date.')).toBeInTheDocument()
    const date = d.getByLabelText('Access ends')
    fireEvent.change(date, { target: { value: '2001-01-01' } })
    await user.click(d.getByRole('button', { name: 'Add' }))
    expect(await d.findByText('Choose a date in the future.')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'inviteGuest')).toBe(false)
    fireEvent.change(date, { target: { value: '2099-06-30' } })
    await user.click(d.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'inviteGuest')?.body).toMatchObject({ workspaceId: 'ws-dm', fileId: 'f1', email: 'satinalma@yildiztorna.com', level: 'view' }))
    const sent = calls.find((c) => c.operation === 'inviteGuest')?.body['accessExpiresAt']
    expect(typeof sent).toBe('number')
    expect(sent as number).toBeGreaterThan(Date.now() / 1000)
  })

  it('does not offer editing to a guest member and says why', async () => {
    const { user } = open()
    const d = await dialog()
    await user.type(await d.findByRole('textbox', { name: 'Add a person or email' }), 'Ömer')
    await user.click(await d.findByRole('button', { name: /Ömer Koç/ }))
    expect(d.getByText('Guests cannot edit. Make them a member to allow editing.')).toBeInTheDocument()
    await user.click(d.getByRole('combobox', { name: 'Access' }))
    expect(await screen.findByRole('option', { name: 'Can edit' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('removes a person added in this window', async () => {
    const { calls, user } = open()
    const d = await dialog()
    await user.type(await d.findByRole('textbox', { name: 'Add a person or email' }), 'Selin')
    await user.click(await d.findByRole('button', { name: /Selin Er/ }))
    await user.click(d.getByRole('button', { name: 'Add' }))
    await user.click(await d.findByRole('button', { name: 'Remove access of Selin Er' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'revokeFileAccess' && c.body['userId'] === 'u-selin')).toBe(true))
  })
})

describe('link', () => {
  it('turns the link on with the defaults, changes the level, sets a password and copies it', async () => {
    const { calls, user } = open()
    const d = await dialog()
    await user.click(await d.findByRole('switch', { name: /Turn the link on/ }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'createShareLink')?.body).toMatchObject({ level: 'view', fileId: 'f1' }))
    expect(typeof calls.find((c) => c.operation === 'createShareLink')?.body['expiresAt']).toBe('number')
    // Link levels are only view and download.
    const levels = await d.findAllByRole('radio')
    expect(levels.map((radio) => radio.textContent)).toEqual(['Can view', 'Can download'])
    await user.click(d.getByRole('radio', { name: 'Can download' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'updateShareLink')?.body['level']).toBe('download'))

    await user.click(d.getByRole('switch', { name: /Ask for a password/ }))
    await user.type(d.getByLabelText('Link password'), 'short')
    await user.click(d.getByRole('button', { name: 'Set password' }))
    expect(await d.findByText('Use at least 8 characters.')).toBeInTheDocument()
    await user.clear(d.getByLabelText('Link password'))
    await user.type(d.getByLabelText('Link password'), 'long-enough-1')
    await user.click(d.getByRole('button', { name: 'Set password' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'updateShareLink').at(-1)?.body['password']).toBe('long-enough-1'))

    await user.click(d.getByRole('button', { name: 'Copy link' }))
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('https://viz-cad.com/s/k8F2mQ-example-token'))
    expect(calls.some((c) => c.operation === 'copyShareLink')).toBe(true)
  })

  it('turns the link off', async () => {
    const { calls, user } = open()
    const d = await dialog()
    await user.click(await d.findByRole('switch', { name: /Turn the link on/ }))
    await d.findByRole('radio', { name: 'Can view' })
    await user.click(d.getByRole('switch', { name: /Turn the link on/ }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'revokeShareLink')).toBe(true))
    await waitFor(() => expect(d.queryByRole('radio', { name: 'Can view' })).not.toBeInTheDocument())
  })

  it('shows the plan limit text when the link cannot be created', async () => {
    const { user } = renderApp(<ShareDialog file={file} workspaceId="ws-dm" onClose={() => undefined} />, 'admin', (operation) =>
      operation === 'createShareLink' ? new Response(JSON.stringify({ ok: false, error: 'ShareLinkLimitReached' }), { status: 409, headers: { 'content-type': 'application/json' } }) : undefined,
    )
    const d = await dialog()
    await user.click(await d.findByRole('switch', { name: /Turn the link on/ }))
    expect(await d.findByText(/limited number of active share links/)).toBeInTheDocument()
  })

  it('has no copy button for someone who may not manage the link (the server refuses its settings)', async () => {
    open('files-commenter')
    const d = await dialog()
    expect(await d.findByText('The link settings could not be loaded.')).toBeInTheDocument()
    expect(d.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })
})
