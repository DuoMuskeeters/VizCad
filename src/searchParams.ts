/**
 * The router's search parsing (getRouter): TanStack's JSON default, except for params that are raw strings. A node path
 * (`?node=0.1`, docs/11 §1.3) would parse as the number 0.1 (and `0.10` as 0.1), so a copied part link would break and
 * in-app navigation would write `%220.1%22`. Raw params are read as written (optional quotes stripped) and written
 * unquoted.
 */
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router'

const RAW = ['node'] as const

/** `"0.1"` (an old in-app link) → `0.1`. */
const unquote = (value: string) => (value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value)

export const parseSearch = (search: string): Record<string, unknown> => {
  const out = defaultParseSearch(search)
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of RAW) {
    const raw = params.get(key)
    if (raw !== null) out[key] = unquote(raw)
  }
  return out
}

export const stringifySearch = (search: Record<string, unknown>): string => {
  const rest: Record<string, unknown> = { ...search }
  const pairs: string[] = []
  for (const key of RAW) {
    const value = rest[key]
    if (typeof value !== 'string') continue
    delete rest[key]
    pairs.push(`${key}=${encodeURIComponent(value)}`)
  }
  const base = defaultStringifySearch(rest)
  if (pairs.length === 0) return base
  return base === '' ? `?${pairs.join('&')}` : `${base}&${pairs.join('&')}`
}
