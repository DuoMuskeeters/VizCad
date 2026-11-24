import type { Defer } from '../services/Auth.live'

const cache = new WeakMap<object, Defer>()

/**
 * A stable `Defer` for a given `waitUntil`. `liveLayers` memoizes per env and `Defer`, so the same function must come back
 * on every request: `waitUntil` from `cloudflare:workers` is one function for the isolate's life.
 */
export const deferOf = (waitUntil: (promise: Promise<unknown>) => void): Defer => {
  const known = cache.get(waitUntil)
  if (known !== undefined) return known
  const made: Defer = (run) => waitUntil(run())
  cache.set(waitUntil, made)
  return made
}
