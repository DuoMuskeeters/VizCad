import { useSyncExternalStore } from 'react'

/** The `app:` breakpoint (styles.css `--breakpoint-app`): the desktop studio from here on, the phone layout below. */
const QUERY = '(min-width: 900px)'

const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null)

const subscribe = (notify: () => void) => {
  const list = media()
  list?.addEventListener('change', notify)
  return () => list?.removeEventListener('change', notify)
}

/**
 * Whether the screen is desktop wide. For what CSS alone cannot decide: the phone gets other components (docs/11 §4.4),
 * not hidden copies of the desktop ones (a hidden folder grid would still draw thumbnails). Without `matchMedia`: wide.
 */
export const useWide = () => useSyncExternalStore(subscribe, () => media()?.matches ?? true, () => true)
