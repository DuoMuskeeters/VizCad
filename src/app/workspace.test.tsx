// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fixtureFetch } from './fixture'
import { SessionProvider } from './session'
import { useWorkspaceState, WorkspaceProvider } from './workspace'

const Probe = () => {
  const { state, completeOnboarding } = useWorkspaceState()
  if (state.status !== 'ready') return null
  return (
    <>
      <p>{state.needsOnboarding ? 'needs onboarding' : 'onboarded'}</p>
      <button onClick={() => void completeOnboarding()}>done</button>
    </>
  )
}

const mount = (scenario: string) =>
  render(
    <SessionProvider fetcher={fixtureFetch(scenario)}>
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    </SessionProvider>,
  )

describe('onboarding flag from the server (D20)', () => {
  it('a new sign-up needs onboarding until it is completed', async () => {
    mount('newuser')
    expect(await screen.findByText('needs onboarding')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'done' }))
    await waitFor(() => expect(screen.getByText('onboarded')).toBeInTheDocument())
  })

  it('an existing user never needs it', async () => {
    mount('personal')
    expect(await screen.findByText('onboarded')).toBeInTheDocument()
  })
})
