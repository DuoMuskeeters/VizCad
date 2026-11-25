import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilePage } from '#/shared/fileViews'
import type { AppFailure } from '../api'
import { useSession } from '../session'
import type { AnyFileView, FileFilter, FileSort } from './types'

export type FileQuery = {
  readonly filter: FileFilter
  readonly query: string
  readonly sort: FileSort
  readonly direction: 'asc' | 'desc'
}

export type FileListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: AppFailure }
  | { readonly status: 'ready'; readonly items: readonly AnyFileView[]; readonly nextCursor: string | null; readonly loadingMore: boolean }

/** The paged `listFiles` result for one filter/search/sort. A newer query or a `reload` wins over a slower older answer. */
export const useFileList = (workspaceId: string, query: FileQuery, projectId?: string) => {
  const { call, expire } = useSession()
  const [state, setState] = useState<FileListState>({ status: 'loading' })
  const generation = useRef(0)
  const { filter, query: text, sort, direction } = query

  const request = useCallback(
    (cursor: string | null) =>
      call<FilePage>('listFiles', {
        workspaceId,
        filter,
        sort,
        direction,
        limit: 30,
        ...(text.trim() === '' ? {} : { query: text.trim() }),
        ...(projectId === undefined ? {} : { projectId }),
        ...(cursor === null ? {} : { cursor }),
      }),
    [call, workspaceId, filter, text, sort, direction, projectId],
  )

  const load = useCallback(
    async (keepItems: boolean) => {
      const mine = ++generation.current
      if (!keepItems) setState({ status: 'loading' })
      const result = await request(null)
      if (mine !== generation.current) return
      if (result.ok) setState({ status: 'ready', items: result.data.items, nextCursor: result.data.nextCursor, loadingMore: false })
      else if (result.error === 'Unauthenticated') expire()
      else setState({ status: 'error', failure: result })
    },
    [request, expire],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || state.nextCursor === null || state.loadingMore) return
    const mine = generation.current
    const cursor = state.nextCursor
    setState({ ...state, loadingMore: true })
    const result = await request(cursor)
    if (mine !== generation.current) return
    setState((current) => {
      if (current.status !== 'ready') return current
      if (!result.ok) return { ...current, loadingMore: false }
      const known = new Set(current.items.map((item) => item.id))
      return { status: 'ready', items: [...current.items, ...result.data.items.filter((item) => !known.has(item.id))], nextCursor: result.data.nextCursor, loadingMore: false }
    })
  }, [state, request])

  const patch = useCallback((id: string, change: (file: AnyFileView) => AnyFileView) => {
    setState((current) => (current.status === 'ready' ? { ...current, items: current.items.map((item) => (item.id === id ? change(item) : item)) } : current))
  }, [])

  const remove = useCallback((ids: ReadonlySet<string>) => {
    setState((current) => (current.status === 'ready' ? { ...current, items: current.items.filter((item) => !ids.has(item.id)) } : current))
  }, [])

  return { state, reload: () => load(true), retry: () => load(false), loadMore, patch, remove }
}
