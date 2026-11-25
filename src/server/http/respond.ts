import { Effect, type Layer } from 'effect'
import type { AppError } from '../errors'

/** HTTP status per tagged error. A Record keeps the mapping exhaustive: a new error fails type checking here. */
export const STATUS: Record<AppError['_tag'], number> = {
  ValidationError: 400,
  PayloadTooLarge: 413,
  CaptchaFailed: 403,
  ConfigError: 500,
  DbError: 500,
  StorageError: 500,
  EmailError: 502,
  CacheError: 502,
  AuthError: 500,
  Unauthenticated: 401,
  WorkspaceUnavailable: 404,
  ResourceUnavailable: 404,
  CsrfRejected: 403,
  RateLimitExceeded: 429,
  RateLimitError: 503,
  EmailUnverified: 403,
  PermissionDenied: 403,
  InvitationUnavailable: 404,
  InvitationExpired: 410,
  InvitationConflict: 409,
  SeatLimitReached: 409,
  GuestLimitReached: 409,
  ProjectLimitReached: 409,
  MemberUnavailable: 404,
  RoleConflict: 409,
  LastOwner: 409,
  SlugTaken: 409,
  InvalidAccessLevel: 400,
  AccessExpiryInvalid: 400,
  WorkspaceLimitReached: 409,
  AlreadyHasAccess: 409,
  WriteConflict: 409,
  UnsupportedFileType: 415,
  FileTooLarge: 413,
  StorageQuotaExceeded: 409,
  UploadLimitReached: 429,
  UploadUnavailable: 404,
  UploadIncomplete: 409,
  UploadMismatch: 422,
  VersionTypeMismatch: 422,
  VersionUnavailable: 404,
  CommentUnavailable: 404,
}

/** Denial reasons the UI may show ("disabled + why", docs/08 §4). Everything else stays a server diagnostic. */
export const SAFE_REASONS: ReadonlySet<string> = new Set([
  'INSUFFICIENT_LEVEL', 'ROLE_LIMIT', 'FEATURE_UNAVAILABLE', 'LINK_NO_COMMENTS', 'LAST_OWNER', 'PROJECT_MANAGER_REQUIRED',
])

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
  ...(error._tag === 'StorageError' || error._tag === 'AuthError' ? { operation: error.operation } : {}),
  requestId: meta.requestId ?? 'none',
})

/** Clients get the error tag only; 5xx are logged with logFields. */
export const errorResponse = (error: AppError, meta: RequestMeta) =>
  Effect.gen(function* () {
    const status = STATUS[error._tag]
    if (status >= 500) yield* Effect.logError('request failed').pipe(Effect.annotateLogs(logFields(error, meta)))
    // Turnstile's reason is a fixed, non-sensitive code (never the token); it tells a bad widget from an attack.
    else if (error._tag === 'CaptchaFailed') yield* Effect.logInfo('captcha failed').pipe(Effect.annotateLogs({ ...logFields(error, meta), reason: error.reason }))
    const headers = error._tag === 'RateLimitExceeded' ? { ...noStore, 'retry-after': String(error.retryAfterSeconds) } : noStore
    const reason = error._tag === 'PermissionDenied' && SAFE_REASONS.has(error.reason) ? { reason: error.reason } : {}
    return Response.json({ ok: false, error: error._tag, ...reason }, { status, headers })
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
