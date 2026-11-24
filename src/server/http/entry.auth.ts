import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { identityResponse } from './auth'
import { deferOf } from './defer'
import { requestMeta } from './respond'

/** `/api/auth/*`: allowlist, CSRF, rate limits and Turnstile in front of better-auth (http/auth.ts). Own chunk; the SDK loads lazily inside Auth.live. */
export const handleIdentity = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  const live = liveLayers(env, deferOf(waitUntil))
  return Effect.runPromise(
    identityResponse(request, Layer.mergeAll(live.auth, live.rateLimit, live.turnstile, live.config), requestMeta(request)),
  )
}
