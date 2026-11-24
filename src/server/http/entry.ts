import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { appResponse } from './app'
import { identityResponse } from './auth'
import { healthResponse } from './health'
import { requestMeta } from './respond'

/** Worker entry points for API routes: wire live layers from the env and run the handler. */
export const handleHealth = (request: Request, env: Cloudflare.Env): Promise<Response> =>
  Effect.runPromise(healthResponse(liveLayers(env).db, requestMeta(request)))

/** `/api/auth/*`: allowlist, CSRF, rate limits and Turnstile in front of better-auth (http/auth.ts). */
export const handleIdentity = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  const live = liveLayers(env, (run) => waitUntil(run()))
  return Effect.runPromise(
    identityResponse(request, Layer.mergeAll(live.auth, live.rateLimit, live.turnstile, live.config), requestMeta(request)),
  )
}

/** `/api/app/*`: product API (http/app.ts). Invitation mail is sent after the response through `waitUntil`. */
export const handleApp = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  const live = liveLayers(env, (run) => waitUntil(run()))
  return Effect.runPromise(
    appResponse(
      request,
      Layer.mergeAll(live.db, live.auth, live.email, live.rateLimit, live.config, live.entitlements, live.background),
      requestMeta(request),
    ),
  )
}
