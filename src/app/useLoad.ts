import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppFailure } from './api'
import { useSession } from './session'

export type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: AppFailure }
  | { readonly status: 'ready'; readonly data: T }

/** One read operation of `/api/app/*`, loaded on mount and whenever its body changes; a newer request wins over a slower older one. */
export const useLoad = <T,>(operation: string, body: Record<string, unknown>) => {
  const { call, expire } = useSession()
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const generation = useRef(0)
  const key = JSON.stringify(body)

  const load = useCallback(
    async (keep: boolean) => {
      const mine = ++generation.current
      if (!keep) setState({ status: 'loading' })
      const result = await call<T>(operation, JSON.parse(key) as Record<string, unknown>)
      if (mine !== generation.current) return
      if (result.ok) setState({ status: 'ready', data: result.data })
      else if (result.error === 'Unauthenticated') expire()
      else setState({ status: 'error', failure: result })
    },
    [call, expire, operation, key],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  return { state, reload: () => load(true), retry: () => load(false), set: (data: T) => setState({ status: 'ready', data }) }
}
