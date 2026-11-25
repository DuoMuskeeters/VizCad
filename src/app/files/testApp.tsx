import { vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import '../../components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { fixtureFetch } from '../fixture'
import { SessionProvider, useSession } from '../session'
import { useWorkspaceState, WorkspaceProvider } from '../workspace'

const Ready = ({ children }: { children: ReactNode }) => {
  const session = useSession()
  const workspaces = useWorkspaceState()
  return session.state.status === 'ready' && workspaces.state.status === 'ready' ? children : null
}

export type Call = { operation: string; body: Record<string, unknown> }

export const failure = (status: number, error: string, reason?: string) =>
  new Response(JSON.stringify({ ok: false, error, ...(reason ? { reason } : {}) }), { status, headers: { 'content-type': 'application/json' } })

/** Renders `ui` with session + workspace loaded from the in-memory fixture; every product call is recorded. `override` may answer an operation itself. */
export const renderApp = (ui: ReactNode, scenario: string, override?: (operation: string, body: Record<string, unknown>) => Response | undefined) => {
  const calls: Call[] = []
  const inner = fixtureFetch(scenario)
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/api/app/')) {
      const operation = url.slice('/api/app/'.length)
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ operation, body })
      const answer = override?.(operation, body)
      if (answer) return answer
    }
    return inner(input, init)
  }) as unknown as typeof fetch
  render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <SessionProvider fetcher={fetcher}>
          <WorkspaceProvider>
            <Ready>{ui}</Ready>
          </WorkspaceProvider>
        </SessionProvider>
      </UiProvider>
    </I18nProvider>,
  )
  return { calls, user: userEvent.setup() }
}
