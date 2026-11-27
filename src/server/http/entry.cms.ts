import { Effect, Layer } from 'effect'
import type { Locale } from '#/i18n/locales'
import { cmsProbe, type ProbeData } from '../programs/cms/probe'
import { liveLayers } from '../services/live'
import { cmsResponse } from './cms'
import { requestMeta } from './respond'

export type ProbeResult = { readonly ok: true; readonly data: ProbeData } | { readonly ok: false }

/**
 * Data for the temporary `/dev/cms-probe` page (docs/12 §7.5, removed in 6b). Loaded by the route's server function
 * with dynamic `import()`; only the Db layer is built. A D1 failure is `{ ok: false }` (the page then opts out of the
 * edge cache), logged by tag only.
 */
export const loadCmsProbe = (env: Cloudflare.Env, locale: Locale): Promise<ProbeResult> =>
  Effect.runPromise(
    cmsProbe(locale).pipe(
      Effect.map((data): ProbeResult => ({ ok: true, data })),
      Effect.catchTag('DbError', (error) =>
        Effect.logError('cms probe failed').pipe(Effect.annotateLogs({ tag: error._tag }), Effect.as<ProbeResult>({ ok: false })),
      ),
      Effect.provide(liveLayers(env).db),
    ),
  )

/** `/api/cms/*`: admin CMS API (http/cms.ts). Only the layers its operations read are built. */
export const handleCms = (request: Request, env: Cloudflare.Env): Promise<Response> => {
  const live = liveLayers(env)
  return Effect.runPromise(
    cmsResponse(request, Layer.mergeAll(live.db, live.auth, live.rateLimit, live.config, live.cache), requestMeta(request)),
  )
}
