import { notFound } from '@tanstack/react-router'

/**
 * Checks whether the current runtime is the production environment.
 * In local dev (import.meta.env.DEV) this is always false.
 * In production builds (CLOUDFLARE_ENV=production or hostname viz-cad.com) it is true.
 */
export const isProduction = (): boolean => {
  if (import.meta.env.DEV) return false
  if (import.meta.env.VIZCAD_PRODUCTION) return true
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'viz-cad.com' || host === 'www.viz-cad.com') return true
  }
  return false
}

/**
 * Throws notFound() in production so dev routes return 404.
 */
export const requireDevEnvironment = (): void => {
  if (isProduction()) {
    throw notFound()
  }
}

/**
 * Wraps a dev-only server function handler. Its RPC endpoint can be called without loading the route, so the route's
 * `beforeLoad` guard alone does not protect it: the handler runs the same check first.
 */
export const devOnly =
  <Args extends ReadonlyArray<unknown>, A>(handler: (...args: Args) => Promise<A>) =>
  async (...args: Args): Promise<A> => {
    requireDevEnvironment()
    return handler(...args)
  }
