import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '#/components/ui/Button'
import { InlineAlert } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { useI18n } from '#/i18n'
import { makeCall, readSessionUser, type Call, type SessionUser } from './api'

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly user: SessionUser }

type SessionContext = { readonly state: SessionState; readonly call: Call; readonly reload: () => void; readonly expire: () => void }
const Ctx = createContext<SessionContext | null>(null)

export const useSession = (): SessionContext => {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

/** The signed-in user; only valid below <RequireSession>. */
export const useUser = (): SessionUser => {
  const { state } = useSession()
  if (state.status !== 'ready') throw new Error('useUser needs a signed-in session')
  return state.user
}

/** Dev only: `?fixture=owner` swaps the network for an in-memory API (src/app/fixture.ts). Stripped from production builds. */
const useFetcher = (given: typeof fetch | undefined): typeof fetch | null => {
  const [fetcher, setFetcher] = useState<typeof fetch | null>(given ?? null)
  useEffect(() => {
    if (given) return
    let cancelled = false
    const fixture = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('fixture') : null
    if (import.meta.env.DEV && fixture) {
      void import('./fixture').then((m) => {
        if (!cancelled) setFetcher(() => m.fixtureFetch(fixture))
      })
    } else setFetcher(() => (...args: Parameters<typeof fetch>) => fetch(...args))
    return () => {
      cancelled = true
    }
  }, [given])
  return fetcher
}

export const SessionProvider = ({ fetcher: given, children }: { fetcher?: typeof fetch; children: ReactNode }) => {
  const fetcher = useFetcher(given)
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const call = useMemo(() => makeCall(fetcher ?? undefined), [fetcher])

  useEffect(() => {
    if (!fetcher) return
    let cancelled = false
    setState({ status: 'loading' })
    void readSessionUser(fetcher).then((user) => {
      if (cancelled) return
      if (user === 'error') setState({ status: 'error' })
      else setState(user ? { status: 'ready', user } : { status: 'anonymous' })
    })
    return () => {
      cancelled = true
    }
  }, [fetcher, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const expire = useCallback(() => setState({ status: 'anonymous' }), [])
  const value = useMemo(() => ({ state, call, reload, expire }), [state, call, reload, expire])
  return <Ctx value={value}>{children}</Ctx>
}

const PageSkeleton = () => (
  <div className="mx-auto grid w-full max-w-130 gap-4 px-4 py-16" aria-busy="true">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </div>
)

/** Children render only with a session. Without one the visitor goes to /sign-in and comes back to this page. */
export const RequireSession = ({ children }: { children: ReactNode }) => {
  const { state, reload } = useSession()
  const { t } = useI18n()
  const navigate = useNavigate()
  const anonymous = state.status === 'anonymous'
  useEffect(() => {
    if (!anonymous) return
    const next = `${window.location.pathname}${window.location.search}`
    void navigate({ to: '/sign-in', search: { next } })
  }, [anonymous, navigate])

  if (state.status === 'ready') return children
  if (state.status === 'error')
    return (
      <div className="px-4 py-16">
        <InlineAlert title={t('app.error.loadTitle')} action={<Button onClick={reload}>{t('common.retry')}</Button>}>
          {t('app.error.network')}
        </InlineAlert>
      </div>
    )
  return <PageSkeleton />
}

