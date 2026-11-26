import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { deferOf } from './defer'
import { requestMeta } from './respond'
import { shareResponse } from './share'

/** `/s/*` and `/api/s/*`: share link pages' data, password proof and delivery (http/share.ts). No session, no SDK. */
export const handleShare = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  // The same layer set as /api/app (memoized per env and defer), so config and bindings are built once per isolate.
  const live = liveLayers(env, deferOf(waitUntil))
  return Effect.runPromise(
    shareResponse(request, Layer.mergeAll(live.db, live.config, live.storage, live.rateLimit, live.turnstile, live.entitlements), requestMeta(request)),
  )
}
