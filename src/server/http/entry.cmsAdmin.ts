import { Effect, Layer } from 'effect'
import { liveLayers } from '../services/live'
import { cmsResponse } from './cms'
import { requestMeta } from './respond'

/**
 * `/api/cms/*`: the admin CMS API (http/cms.ts). Its own chunk: the admin programs and the markdown renderer
 * (mdast/micromark) load only here, never on the public blog's cache-miss path (entry.cms.ts). Only the layers its
 * operations read are built.
 */
export const handleCms = (request: Request, env: Cloudflare.Env): Promise<Response> => {
  const live = liveLayers(env)
  return Effect.runPromise(
    cmsResponse(request, Layer.mergeAll(live.db, live.auth, live.rateLimit, live.config, live.cache), requestMeta(request)),
  )
}
