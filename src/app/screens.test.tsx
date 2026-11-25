// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { ActivityPage } from './activity/ActivityPage'
import { FilesPage } from './files/FilesPage'
import { renderApp } from './files/testApp'
import { UploadProvider } from './files/UploadProvider'
import { ProjectPage } from './projects/ProjectPage'
import { ProjectsPage } from './projects/ProjectsPage'
import { SharedPage } from './shared/SharedPage'
import { TrashPage } from './trash/TrashPage'

vi.mock('@tanstack/react-router', async () => {
  const base = (await import('./files/routerMock')).routerMock
  return { ...base, useParams: () => ({ id: 'p-pompa' }) }
})

const app = (ui: React.ReactNode, scenario = 'admin', override?: Parameters<typeof renderApp>[2]) => renderApp(<UploadProvider>{ui}</UploadProvider>, scenario, override)

describe('Move window', () => {
  it('lists the projects, warns about an invited-only target and asks again before moving when access would be removed', async () => {
    const { calls, user } = app(<FilesPage />)
    await user.click(await screen.findByRole('button', { name: 'Mil_Ø25x300.step: more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(calls.some((c) => c.operation === 'listProjects')).toBe(true)
    expect(await dialog.findByRole('radio', { name: /No project/ })).toBeInTheDocument()
    await user.click(await dialog.findByRole('radio', { name: /Pompa revizyonu/ }))
    expect(dialog.getByText('This project is invited-only')).toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Move' }))
    // The preview shows what would be taken away; nothing moved yet.
    expect(await dialog.findByText(/1 member accesses/)).toBeInTheDocument()
    expect(calls.find((c) => c.operation === 'previewMoveFile')?.body).toMatchObject({ fileId: 'f5', targetProjectId: 'p-pompa' })
    expect(calls.some((c) => c.operation === 'moveFile')).toBe(false)

    await user.click(dialog.getByRole('button', { name: 'Move anyway' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'moveFile')?.body).toMatchObject({ fileId: 'f5', targetProjectId: 'p-pompa', expected: { links: 0, invitations: 0, guestGrants: 0, memberGrants: 1 } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves straight away into a team project and out of every project; the current place is not offered', async () => {
    const { calls, user } = app(<FilesPage />)
    await user.click(await screen.findByRole('button', { name: 'Flanş_DN100_rev3.step: more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByRole('radio', { name: /Pompa revizyonu/ })).toBeDisabled()
    await user.click(await dialog.findByRole('radio', { name: /No project/ }))
    await user.click(dialog.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'moveFile')?.body).toMatchObject({ fileId: 'f1', targetProjectId: null }))
  })
})

describe('Trash', () => {
  it('restores a file and asks before deleting one for good', async () => {
    const { calls, user } = app(<TrashPage />)
    expect(await screen.findByText('Eski_braket_v1.step')).toBeInTheDocument()
    const row = screen.getByText('Eski_braket_v1.step').closest('[role="row"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'restoreFile' && c.body['fileId'] === 't1')).toBe(true))
    await waitFor(() => expect(screen.queryByText('Eski_braket_v1.step')).not.toBeInTheDocument())

    const other = screen.getByText('Kapak_taslak.stl').closest('[role="row"]') as HTMLElement
    await user.click(within(other).getByRole('button', { name: 'Kapak_taslak.stl: more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /Delete forever/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Delete Kapak_taslak.stl forever?')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'purgeFile')).toBe(false)
    await user.click(dialog.getByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'purgeFile')?.body).toEqual({ workspaceId: 'ws-dm', fileId: 't2' }))
    await waitFor(() => expect(screen.queryByText('Kapak_taslak.stl')).not.toBeInTheDocument())
  })

  it('empties the trash after a confirmation and keeps calling while the server says there is more', async () => {
    const { calls, user } = app(<TrashPage />)
    await screen.findByText('Eski_braket_v1.step')
    await user.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Empty the trash?')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'emptyTrash')).toBe(false)
    await user.click(dialog.getByRole('button', { name: 'Empty trash' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'emptyTrash')).toHaveLength(2))
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument()
  })

  it('shows the days left and says why a commenter cannot delete for good', async () => {
    const { user } = app(<TrashPage />, 'files-commenter')
    const row = (await screen.findByText('Test_parça_3.obj')).closest('[role="row"]') as HTMLElement
    expect(within(row).getAllByText(/in 3 days|in 2 days/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Empty trash/ })).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(row).getByRole('button', { name: 'Test_parça_3.obj: more actions' }))
    const item = await screen.findByRole('menuitem', { name: /Delete forever/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent('Only owners and admins delete files for good.')
  })
})

describe('Project access', () => {
  it('opens the project to the team at once and asks for confirmation before making it invited-only', async () => {
    const { calls, user } = app(<ProjectPage />)
    await user.click(await screen.findByRole('tab', { name: 'Access' }))
    const group = await screen.findByRole('radiogroup', { name: 'Who can see this project' })
    expect(within(group).getByRole('radio', { name: /Invited only/ })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: /All team/ }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'setProjectAccessMode')?.body).toEqual({ workspaceId: 'ws-dm', projectId: 'p-pompa', accessMode: 'team' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: /All team/ })).toBeChecked())

    await user.click(within(group).getByRole('radio', { name: /Invited only/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Share links and guest invitations on this project’s files are canceled/)).toBeInTheDocument()
    expect(calls.filter((c) => c.operation === 'setProjectAccessMode')).toHaveLength(1)
    await user.click(dialog.getByRole('button', { name: 'Make invited-only' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'setProjectAccessMode').at(-1)?.body['accessMode']).toBe('restricted'))
  })

  it('lists the project people and needs an end date for a guest', async () => {
    const { calls, user } = app(<ProjectPage />)
    await user.click(await screen.findByRole('tab', { name: 'Access' }))
    expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument()
    expect(calls.find((c) => c.operation === 'listProjectAccess')?.body).toEqual({ workspaceId: 'ws-dm', projectId: 'p-pompa' })
    expect(screen.getByText('satinalma@kayahidrolik.com')).toBeInTheDocument()
    await user.type(await screen.findByRole('textbox', { name: 'Add a person or email' }), 'tedarikci@firma.com')
    await user.click(await screen.findByRole('button', { name: /Invite tedarikci@firma.com as a guest/ }))
    expect(screen.getByText('Guests need an end date.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'inviteGuest')?.body).toMatchObject({ projectId: 'p-pompa', email: 'tedarikci@firma.com' }))
    expect(typeof calls.find((c) => c.operation === 'inviteGuest')?.body['accessExpiresAt']).toBe('number')
  })

  it('says a project is not available when it is not in the list (a commenter does not see invited-only projects)', async () => {
    app(<ProjectPage />, 'files-commenter')
    expect(await screen.findByText('This project is not available')).toBeInTheDocument()
  })

  it('uploads into the project and lists only its files', async () => {
    const { calls } = app(<ProjectPage />)
    expect(await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Konveyör_şase.iges' })).not.toBeInTheDocument()
    expect(calls.find((c) => c.operation === 'listFiles')?.body).toMatchObject({ projectId: 'p-pompa' })
  })
})

describe('Projects', () => {
  it('creates a project with the chosen access and needs a name', async () => {
    const { calls, user } = app(<ProjectsPage />)
    expect(await screen.findByRole('link', { name: 'Pompa revizyonu' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'Create project' }))
    expect(await dialog.findByText('Enter a project name.')).toBeInTheDocument()
    await user.type(dialog.getByLabelText('Project name'), 'Yeni iş')
    await user.click(dialog.getByRole('radio', { name: /Invited only/ }))
    await user.click(dialog.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'createProject')?.body).toMatchObject({ workspaceId: 'ws-dm', name: 'Yeni iş', accessMode: 'restricted' }))
  })

  it('archives only after a confirmation', async () => {
    const { calls, user } = app(<ProjectsPage />)
    await user.click(await screen.findByRole('button', { name: 'Arşiv 2025: diğer eylemler' }).catch(() => screen.findByRole('button', { name: /Arşiv 2025/ })))
    await user.click(await screen.findByRole('menuitem', { name: /Archive project/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(calls.some((c) => c.operation === 'archiveProject')).toBe(false)
    await user.click(dialog.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'archiveProject')?.body).toEqual({ workspaceId: 'ws-dm', projectId: 'p-arsiv' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Arşiv 2025' })).not.toBeInTheDocument())
  })

  it('shows the empty text with a create button', async () => {
    app(<ProjectsPage />, 'files-empty')
    expect(await screen.findByText('Create your first project')).toBeInTheDocument()
  })
})

describe('Shared lists', () => {
  it('shows files shared with me and, on the second tab, the ones I shared', async () => {
    const { calls, user } = app(<SharedPage />)
    expect(await screen.findByRole('link', { name: 'Pompa_gövdesi_montaj.step' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Shared by me' }))
    expect(await screen.findByRole('link', { name: 'Kapak_plakası_t5.obj' })).toBeInTheDocument()
    expect(calls.map((c) => c.operation)).toEqual(expect.arrayContaining(['listSharedWithMe', 'listSharedByMe']))
    await user.click(screen.getAllByRole('button', { name: 'Manage sharing' })[0] as HTMLElement)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'listFileAccess')).toBe(true)
  })
})

describe('Activity', () => {
  it('lists the workspace log for admins and filters by type', async () => {
    const { user } = app(<ActivityPage />)
    expect(await screen.findAllByText('downloaded a file.')).not.toHaveLength(0)
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Comments' }))
    expect(screen.queryByText('downloaded a file.')).not.toBeInTheDocument()
    expect(screen.getAllByText('wrote a comment.')).not.toHaveLength(0)
  })

  it('says only owners and admins see it for any other role', async () => {
    const { calls } = app(<ActivityPage />, 'commenter')
    expect(await screen.findByText('Only owners and admins see activity')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'listActivity')).toBe(false)
  })
})
