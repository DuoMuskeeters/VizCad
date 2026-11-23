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

/** Clients get the error tag only; details (causes, keys) stay in the Worker logs. */
export const errorResponse = (error: AppError) =>
  Effect.gen(function* () {
    const status = STATUS[error._tag]
    if (status >= 500) yield* Effect.logError(error._tag, error)
    return Response.json({ ok: false, error: error._tag }, { status, headers: { 'cache-control': 'no-store' } })
  })

/** Runs a handler program with its layers; every failure, including layer construction, becomes a response. */
export const run = <R>(program: Effect.Effect<Response, AppError, R>, layer: Layer.Layer<R, AppError>) =>
  program.pipe(Effect.provide(layer), Effect.catch(errorResponse), Effect.runPromise)
