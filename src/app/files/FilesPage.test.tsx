// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { FilesPage } from './FilesPage'
import { UploadProvider } from './UploadProvider'
import { renderApp } from './testApp'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('[role="row"]') as HTMLElement

describe('all files', () => {
  it('lists the workspace files and loads the next page on request', async () => {
    const { calls } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'admin')
    expect(await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })).toBeInTheDocument()
    expect(calls.find((c) => c.operation === 'listFiles')?.body).toMatchObject({ workspaceId: 'ws-dm', filter: 'all', sort: 'updated' })
  })

  it('asks for the chosen filter and shows the starred empty text', async () => {
    const { calls, user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'files-empty')
    expect(await screen.findByText('No files yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Starred' }))
    expect(await screen.findByText('No starred files')).toBeInTheDocument()
    expect(calls.filter((c) => c.operation === 'listFiles').at(-1)?.body['filter']).toBe('starred')
  })

  it('searches by name after a pause and shows the no-match text with a way to clear it', async () => {
    const { calls, user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'admin')
    await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })
    await user.type(screen.getByRole('searchbox', { name: 'Search files' }), 'zzz')
    expect(await screen.findByText('No file matches “zzz”')).toBeInTheDocument()
    expect(calls.filter((c) => c.operation === 'listFiles').at(-1)?.body['query']).toBe('zzz')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })).toBeInTheDocument()
  })

  it('shows the error text with a retry that loads again', async () => {
    const { user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'files-error')
    expect(await screen.findByText('Files could not be loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('Files could not be loaded')).toBeInTheDocument()
  })

  it('stars a file and moves it to trash with an undo', async () => {
    const { calls, user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'admin')
    const row = await rowOf('Konveyör_şase.iges')
    await user.click(within(row).getByRole('button', { name: 'Konveyör_şase.iges: more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add star' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'starFile' && c.body['fileId'] === 'f3')).toBe(true))
    await user.click(within(row).getByRole('button', { name: 'Konveyör_şase.iges: more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to trash' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Konveyör_şase.iges' })).not.toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'restoreFile' && c.body['fileId'] === 'f3')).toBe(true))
  })
})

describe('row menu follows the permissions', () => {
  it('a commenter sees rename, share, move, trash and download disabled with the reason', async () => {
    const { user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'files-commenter')
    const row = await rowOf('Flanş_DN100_rev3.step')
    await user.click(within(row).getByRole('button', { name: 'Flanş_DN100_rev3.step: more actions' }))
    const rename = await screen.findByRole('menuitem', { name: /Rename/ })
    expect(rename).toHaveAttribute('aria-disabled', 'true')
    expect(rename).toHaveTextContent('No edit permission. Ask the owner of the file.')
    expect(screen.getByRole('menuitem', { name: /Share/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /Move to trash/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /Download/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('a member can use every action, moving a file without a project included', async () => {
    const { user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'admin')
    const row = await rowOf('Konveyör_şase.iges')
    await user.click(within(row).getByRole('button', { name: 'Konveyör_şase.iges: more actions' }))
    expect(await screen.findByRole('menuitem', { name: /Rename/ })).not.toHaveAttribute('aria-disabled')
    const move = screen.getAllByRole('menuitem').find((item) => item.textContent?.startsWith('Move') && !item.textContent.startsWith('Move to trash'))
    expect(move).not.toHaveAttribute('aria-disabled')
  })
})

describe('selection', () => {
  it('selects rows and offers the bulk bar, trashing them in one go', async () => {
    const { calls, user } = renderApp(<UploadProvider><FilesPage /></UploadProvider>, 'admin')
    await user.click(await screen.findByRole('checkbox', { name: 'Select Konveyör_şase.iges' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Rulman_yuvası_6205.stl' }))
    const bar = await screen.findByRole('region', { name: 'Selected files' })
    expect(within(bar).getByText('2 files selected')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'trashFile')).toHaveLength(2))
    expect(await screen.findByText('2 files moved to trash')).toBeInTheDocument()
  })
})
