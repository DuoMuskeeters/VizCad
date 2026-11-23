import { Effect } from 'effect'
import { health } from '../programs/health'
import { liveLayers } from '../services/live'
import { run } from './respond'

/** GET /api/health. 200 when D1 answers, 503 otherwise; never cached. */
export const handleHealth = (env: Cloudflare.Env): Promise<Response> =>
  run(
    health().pipe(
      Effect.map((result) => Response.json(result, { status: result.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } })),
    ),
    liveLayers(env).db,
  )
