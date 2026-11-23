import { Effect, Layer } from 'effect'
import type { AppError } from '../errors'
import { health } from '../programs/health'
import type { Db } from '../services/Db'
import { errorResponse, type RequestMeta, handle } from './respond'

const noStore = { 'cache-control': 'no-store' }
const unavailable = () => Response.json({ ok: false }, { status: 503, headers: noStore })

/**
 * GET /api/health: 200 `{"ok":true}` when D1 answers. Any failure to reach it (query error, missing
 * config) is a fixed 503 `{"ok":false}`, so monitors see "unavailable", not a server bug; the reason is
 * logged through respond.ts with allowed fields only.
 */
export const healthResponse = (db: Layer.Layer<Db, AppError>, meta: RequestMeta) =>
  handle(
    health().pipe(
      Effect.map((result) => (result.ok ? Response.json(result, { status: 200, headers: noStore }) : unavailable())),
      Effect.provide(db),
      Effect.catch((error) => errorResponse(error, meta).pipe(Effect.as(unavailable()))),
    ),
    Layer.empty,
    meta,
  )
