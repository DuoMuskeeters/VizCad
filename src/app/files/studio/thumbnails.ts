/**
 * The folder view's part thumbnails (docs/11 §4.1, A3): path → object URL, or `null` for a node that draws nothing
 * (no geometry: shown as an icon, never a spinner). Owned by the page and freed with the model, or when colours change
 * (5c-2). Each card subscribes to its own entry, so one finished thumbnail re-renders one card, not the grid.
 */
import { useSyncExternalStore } from 'react'

export type ThumbnailStore = {
  /** The object URL, `null` when the node has no image, `undefined` while not drawn yet. */
  readonly get: (path: string) => string | null | undefined
  readonly set: (path: string, blob: Blob | null) => void
  readonly subscribe: (listener: () => void) => () => void
  /** Frees every URL; the cards draw again. */
  readonly clear: () => void
}

export const createThumbnailStore = (): ThumbnailStore => {
  const entries = new Map<string, string | null>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  return {
    get: (path) => entries.get(path),
    set: (path, blob) => {
      if (entries.has(path)) return
      entries.set(path, blob === null ? null : URL.createObjectURL(blob))
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clear: () => {
      if (entries.size === 0) return
      entries.forEach((url) => {
        if (url !== null) URL.revokeObjectURL(url)
      })
      entries.clear()
      notify()
    },
  }
}

/** One card's entry. */
export const useThumbnail = (store: ThumbnailStore, path: string) =>
  useSyncExternalStore(store.subscribe, () => store.get(path), () => undefined)

/** How many of `paths` are done (drawn or without an image). */
export const useThumbnailsDone = (store: ThumbnailStore, paths: readonly string[]) =>
  useSyncExternalStore(
    store.subscribe,
    () => paths.reduce((n, path) => (store.get(path) === undefined ? n : n + 1), 0),
    () => 0,
  )
