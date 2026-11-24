import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { identityResponse } from './auth'
import { healthResponse } from './health'
import { requestMeta } from './respond'

/** Worker entry points for API routes: wire live layers from the env and run the handler. */
export const handleHealth = (request: Request, env: Cloudflare.Env): Promise<Response> =>
  Effect.runPromise(healthResponse(liveLayers(env).db, requestMeta(request)))

/** `/api/auth/*`: allowlist, CSRF, rate limits and Turnstile in front of better-auth (http/auth.ts). */
export const handleIdentity = (request: Request, env: Cloudflare.Env): Promise<Response> => {
  const live = liveLayers(env)
  return Effect.runPromise(
    identityResponse(request, Layer.mergeAll(live.auth, live.rateLimit, live.turnstile, live.config), requestMeta(request)),
  )
}
