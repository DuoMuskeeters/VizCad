import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { deferOf } from './defer'
import { filesResponse } from './files'
import { requestMeta } from './respond'

/** `/api/files/*`: content and thumbnail delivery for members (http/files.ts). Own chunk; no better-auth SDK, no email. */
export const handleFiles = (request: Request, env: Cloudflare.Env, waitUntil: (promise: Promise<unknown>) => void): Promise<Response> => {
  // The same layer set as /api/app (memoized per env and defer), so config and bindings are built once per isolate.
  const live = liveLayers(env, deferOf(waitUntil))
  return Effect.runPromise(
    filesResponse(request, Layer.mergeAll(live.db, live.auth, live.config, live.storage, live.rateLimit, live.entitlements), requestMeta(request)),
  )
}
