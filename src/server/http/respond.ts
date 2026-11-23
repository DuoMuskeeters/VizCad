import { Effect, type Layer } from 'effect'
import type { AppError } from '../errors'

/** HTTP status per tagged error. A Record keeps the mapping exhaustive: a new error fails type checking here. */
export const STATUS: Record<AppError['_tag'], number> = {
  ValidationError: 400,
  CaptchaFailed: 403,
  ConfigError: 500,
  DbError: 500,
  StorageError: 500,
  EmailError: 502,
  CacheError: 502,
}

export interface RequestMeta {
  /** Cloudflare's `cf-ray`, to find the request in Worker logs. */
  readonly requestId: string | null
}

export const requestMeta = (request: Request): RequestMeta => ({ requestId: request.headers.get('cf-ray') })

const noStore = { 'cache-control': 'no-store' }

/**
 * The only fields that reach logs: tag, operation name and request id. Error payloads (causes with SQL and
 * parameters, R2 keys with user ids and file names, config messages) never do.
 */
export const logFields = (error: AppError, meta: RequestMeta) => ({
  error: error._tag,
  ...(error._tag === 'StorageError' ? { operation: error.operation } : {}),
  requestId: meta.requestId ?? 'none',
})

/** Clients get the error tag only; 5xx are logged with logFields. */
export const errorResponse = (error: AppError, meta: RequestMeta) =>
  Effect.gen(function* () {
    const status = STATUS[error._tag]
    if (status >= 500) yield* Effect.logError('request failed').pipe(Effect.annotateLogs(logFields(error, meta)))
    return Response.json({ ok: false, error: error._tag }, { status, headers: noStore })
  })

/**
 * Runs a handler program with its layers. Every typed failure, including layer construction, maps through
 * STATUS; a defect becomes a fixed 500 and is logged with the request id only.
 */
export const handle = <R>(program: Effect.Effect<Response, AppError, R>, layer: Layer.Layer<R, AppError>, meta: RequestMeta) =>
  program.pipe(
    Effect.provide(layer),
    Effect.catch((error) => errorResponse(error, meta)),
    Effect.catchCause(() =>
      Effect.logError('request crashed').pipe(
        Effect.annotateLogs({ error: 'Defect', requestId: meta.requestId ?? 'none' }),
        Effect.as(Response.json({ ok: false, error: 'InternalError' }, { status: 500, headers: noStore })),
      ),
    ),
  )
