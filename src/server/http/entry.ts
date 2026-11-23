import { Effect } from 'effect'
import { liveLayers } from '../services/live'
import { healthResponse } from './health'
import { requestMeta } from './respond'

/** Worker entry points for API routes: wire live layers from the env and run the handler. */
export const handleHealth = (request: Request, env: Cloudflare.Env): Promise<Response> =>
  Effect.runPromise(healthResponse(liveLayers(env).db, requestMeta(request)))
