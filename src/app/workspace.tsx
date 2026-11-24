import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppFailure, AppResult, WorkspaceSummary } from './api'
import { useSession } from './session'

export type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: AppFailure }
  | { readonly status: 'ready'; readonly workspaces: readonly WorkspaceSummary[]; readonly activeId: string; readonly needsOnboarding: boolean }

type WorkspaceContext = {
  readonly state: WorkspaceState
  /** Selects a workspace on the session (cookie set by the server) and in the UI. */
  readonly switchTo: (id: string) => Promise<AppResult<{ workspaceId: string }>>
  readonly reload: () => Promise<void>
  /** Marks the sign-up onboarding done on the server (finished, skipped, or replaced by an invitation). */
  readonly completeOnboarding: () => Promise<AppResult<{ completed: boolean }>>
  /** Adds a workspace just created (so the switcher shows it before the next reload) and selects it. */
  readonly adopt: (workspace: WorkspaceSummary) => Promise<AppResult<{ workspaceId: string }>>
}

const Ctx = createContext<WorkspaceContext | null>(null)

export const useWorkspaceState = (): WorkspaceContext => {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useWorkspaceState must be used inside <WorkspaceProvider>')
  return ctx
}

/** The selected workspace; only valid when the state is ready (the layout guarantees it for its pages). */
export const useWorkspace = (): { active: WorkspaceSummary; workspaces: readonly WorkspaceSummary[] } => {
  const { state } = useWorkspaceState()
  if (state.status !== 'ready') throw new Error('useWorkspace needs a loaded workspace list')
  const active = state.workspaces.find((w) => w.id === state.activeId) ?? state.workspaces[0]
  if (!active) throw new Error('no workspace')
  return { active, workspaces: state.workspaces }
}

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { call, expire } = useSession()
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' })

  const load = useCallback(async () => {
    const [list, current] = await Promise.all([call<WorkspaceSummary[]>('listMyWorkspaces'), call<{ workspaceId: string; needsOnboarding: boolean }>('currentWorkspace')])
    if (!list.ok) return list.error === 'Unauthenticated' ? expire() : setState({ status: 'error', failure: list })
    if (!current.ok) return current.error === 'Unauthenticated' ? expire() : setState({ status: 'error', failure: current })
    const workspaces = list.data
    const first = workspaces[0]
    if (!first) return setState({ status: 'error', failure: { ok: false, status: 404, error: 'WorkspaceUnavailable' } })
    const activeId = workspaces.some((w) => w.id === current.data.workspaceId) ? current.data.workspaceId : first.id
    setState({ status: 'ready', workspaces, activeId, needsOnboarding: current.data.needsOnboarding })
  }, [call, expire])

  useEffect(() => {
    void load()
  }, [load])

  const switchTo = useCallback(
    async (id: string) => {
      const result = await call<{ workspaceId: string }>('switchWorkspace', { workspaceId: id })
      if (result.ok) setState((s) => (s.status === 'ready' ? { ...s, activeId: result.data.workspaceId } : s))
      return result
    },
    [call],
  )

  const adopt = useCallback(
    async (workspace: WorkspaceSummary) => {
      setState((s) => (s.status === 'ready' && !s.workspaces.some((w) => w.id === workspace.id) ? { ...s, workspaces: [...s.workspaces, workspace] } : s))
      return switchTo(workspace.id)
    },
    [switchTo],
  )

  const completeOnboarding = useCallback(async () => {
    const result = await call<{ completed: boolean }>('completeOnboarding')
    if (result.ok) setState((s) => (s.status === 'ready' ? { ...s, needsOnboarding: false } : s))
    return result
  }, [call])

  const value = useMemo(() => ({ state, switchTo, adopt, reload: load, completeOnboarding }), [state, switchTo, adopt, load, completeOnboarding])
  return <Ctx value={value}>{children}</Ctx>
}
