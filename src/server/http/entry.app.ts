import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { appResponse } from './app'
import { deferOf } from './defer'
import { requestMeta } from './respond'

/** `/api/app/*`: product API (http/app.ts). Invitation mail is sent after the response through `waitUntil`. */
export const handleApp = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  const live = liveLayers(env, deferOf(waitUntil))
  return Effect.runPromise(
    appResponse(
      request,
      Layer.mergeAll(live.db, live.auth, live.email, live.rateLimit, live.config, live.entitlements, live.background, live.storage),
      requestMeta(request),
    ),
  )
}
