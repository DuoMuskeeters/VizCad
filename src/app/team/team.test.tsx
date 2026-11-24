// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { fixtureFetch } from '../fixture'
import { SessionProvider, useSession } from '../session'
import { useWorkspaceState, WorkspaceProvider } from '../workspace'
import { TeamPage } from './TeamPage'

/** What RequireSession and the layout do in the app: the page renders once session and workspaces are loaded. */
const Ready = ({ children }: { children: React.ReactNode }) => {
  const session = useSession()
  const workspaces = useWorkspaceState()
  return session.state.status === 'ready' && workspaces.state.status === 'ready' ? children : null
}

type Call = { operation: string; body: Record<string, unknown> }

/** The in-memory API, with every product call recorded. `override` can answer an operation itself. */
const setup = (scenario: string, override?: (operation: string) => Response | undefined) => {
  const calls: Call[] = []
  const inner = fixtureFetch(scenario)
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/app/')) {
      const operation = url.slice('/api/app/'.length)
      calls.push({ operation, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      const answer = override?.(operation)
      if (answer) return answer
    }
    return inner(input, init)
  }) as unknown as typeof fetch
  render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <SessionProvider fetcher={fetcher}>
          <WorkspaceProvider>
            <Ready>
              <TeamPage />
            </Ready>
          </WorkspaceProvider>
        </SessionProvider>
      </UiProvider>
    </I18nProvider>,
  )
  return { calls, user: userEvent.setup() }
}

const failure = (status: number, error: string, reason?: string) =>
  new Response(JSON.stringify({ ok: false, error, ...(reason ? { reason } : {}) }), { status, headers: { 'content-type': 'application/json' } })

const inviteButton = () => screen.findByRole('button', { name: 'Invite members' })

describe('invite form', () => {
  it('sends one invitation per address with the chosen role and reports the count', async () => {
    const { calls, user } = setup('owner')
    await user.click(await inviteButton())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'elif.new@demirmakina.com kerem.new@demirmakina.com ')
    await user.click(within(dialog).getByRole('radio', { name: /Commenter/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Send invitations' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'inviteMember')).toHaveLength(2))
    const sent = calls.filter((c) => c.operation === 'inviteMember')
    expect(sent.map((c) => c.body['email'])).toEqual(['elif.new@demirmakina.com', 'kerem.new@demirmakina.com'])
    expect(sent.every((c) => c.body['role'] === 'commenter' && c.body['workspaceId'] === 'ws-dm')).toBe(true)
    expect(await screen.findByText('Invitations sent: 2')).toBeInTheDocument()
  })

  it('requires an address and refuses to call the server without one', async () => {
    const { calls, user } = setup('owner')
    await user.click(await inviteButton())
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Send invitations' }))
    expect(await within(dialog).findByText('Add at least one email address.')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'inviteMember')).toBe(false)
  })

  it('shows the seat limit in plain words, keeps the address and stops after the first refusal', async () => {
    const { calls, user } = setup('owner')
    await user.click(await inviteButton())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'full1@demirmakina.com full2@demirmakina.com ')
    await user.click(within(dialog).getByRole('button', { name: 'Send invitations' }))
    expect(await within(dialog).findByText(/All seats are in use/)).toBeInTheDocument()
    expect(calls.filter((c) => c.operation === 'inviteMember')).toHaveLength(1)
    expect(within(dialog).getByText('full1@demirmakina.com', { selector: 'b' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove full2@demirmakina.com' })).toBeInTheDocument()
  })

  it('only offers the admin role to an owner', async () => {
    const owner = setup('owner')
    await owner.user.click(await inviteButton())
    expect(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Admin/ })).toBeInTheDocument()
  })
})

describe('role change', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
  }

  it('asks for confirmation before lowering a role and does nothing on cancel', async () => {
    const { calls, user } = setup('owner')
    await openMenu(user, 'Mehmet Kaya')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Commenter' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(within(dialog).getByText('From Member to Commenter.')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'changeRole')).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.some((c) => c.operation === 'changeRole')).toBe(false)
  })

  it('applies the lower role after the confirmation', async () => {
    const { calls, user } = setup('owner')
    await openMenu(user, 'Mehmet Kaya')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Commenter' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Lower role' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'changeRole')?.body).toEqual({ workspaceId: 'ws-dm', userId: 'u-mehmet', role: 'commenter' }))
    expect(await screen.findByText('Mehmet Kaya is now Commenter.')).toBeInTheDocument()
  })

  it('raises a role without a confirmation window', async () => {
    const { calls, user } = setup('owner')
    await openMenu(user, 'Selin Er')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Member' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'changeRole')?.body['role']).toBe('member'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('maps a write conflict from the server to an understandable sentence inside the confirmation', async () => {
    const { user } = setup('owner', (op) => (op === 'changeRole' ? failure(409, 'WriteConflict') : undefined))
    await openMenu(user, 'Mehmet Kaya')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Commenter' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Lower role' }))
    expect(await screen.findByText('Someone changed this at the same time. Refresh and try again.')).toBeInTheDocument()
  })

  it('confirms removal with the irreversible warning, then removes', async () => {
    const { calls, user } = setup('owner')
    await openMenu(user, 'Zeynep Arslan')
    await user.click(await screen.findByRole('menuitem', { name: /Remove from workspace/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Remove Zeynep Arslan?')).toBeInTheDocument()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'removeMember')?.body).toEqual({ workspaceId: 'ws-dm', userId: 'u-zeynep' }))
  })

  it('explains why the owner cannot be changed', async () => {
    const { user } = setup('admin')
    await openMenu(user, 'Hakan Demir')
    expect(await screen.findByRole('menuitem', { name: /Remove from workspace/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/The owner cannot be changed or removed/)).toBeInTheDocument()
  })
})

describe('pending invitations', () => {
  it('lists them for an admin with resend and cancel', async () => {
    const { calls, user } = setup('admin')
    await user.click(await screen.findByRole('tab', { name: /Pending invitations/ }))
    expect(await screen.findByText('elif@demirmakina.com')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Resend' })[0]!)
    await waitFor(() => expect(calls.find((c) => c.operation === 'inviteMember')?.body['email']).toBe('elif@demirmakina.com'))
    await user.click(screen.getAllByRole('button', { name: 'Cancel invitation' })[0]!)
    await waitFor(() => expect(calls.find((c) => c.operation === 'revokeInvitation')?.body['invitationId']).toBe('inv-1'))
  })
})

describe('views by role', () => {
  it('shows a guest only themselves, without invite rights or tabs', async () => {
    setup('guest')
    expect(await screen.findByText(/you only see yourself/)).toBeInTheDocument()
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.queryByText('Hakan Demir')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('button', { name: 'Invite members' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('lets a commenter see the team (guests too) but not manage it, with the reason written', async () => {
    setup('commenter')
    expect(await screen.findByText('Hakan Demir')).toBeInTheDocument()
    const invite = screen.getByRole('button', { name: 'Invite members' })
    expect(invite).toHaveAttribute('aria-disabled', 'true')
    expect(invite).toHaveAccessibleDescription('Only owners and admins can manage members.')
    expect(screen.getByRole('tab', { name: /Guests/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Pending invitations/ })).toBeNull()
    expect(screen.getByText('Only owners and admins see pending invitations.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows an admin role selects but no admin option', async () => {
    const { user } = setup('admin')
    await user.click(await screen.findByRole('combobox', { name: 'Role of Mehmet Kaya' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Member', 'Commenter'])
  })

  it('invites a personal workspace owner to create a company workspace instead of a team', async () => {
    setup('empty-team')
    expect(await screen.findByText('This workspace is only yours')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create company workspace' })).toBeInTheDocument()
  })
})
