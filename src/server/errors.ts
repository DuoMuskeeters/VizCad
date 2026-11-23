import { Data } from 'effect'

/** Input failed Schema validation at the boundary (request body, query, env). */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
}> {}

/** Required configuration is missing or malformed. */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string
}> {}

/** D1 query failed. */
export class DbError extends Data.TaggedError('DbError')<{
  readonly cause: unknown
}> {}

/** R2 operation (or presigning) failed. */
export class StorageError extends Data.TaggedError('StorageError')<{
  readonly operation: 'head' | 'get' | 'put' | 'delete' | 'presign'
  readonly key: string
  readonly cause: unknown
}> {}

/** Outgoing email could not be sent. */
export class EmailError extends Data.TaggedError('EmailError')<{
  readonly cause: unknown
}> {}

/** Turnstile rejected the token or could not be reached. */
export class CaptchaFailed extends Data.TaggedError('CaptchaFailed')<{
  readonly reason: string
}> {}

/** Edge cache purge failed (reads and writes never fail; they degrade to a miss). */
export class CacheError extends Data.TaggedError('CacheError')<{
  readonly reason: string
}> {}

/** Every error a route handler may have to map to a response. */
export type AppError =
  | ValidationError
  | ConfigError
  | DbError
  | StorageError
  | EmailError
  | CaptchaFailed
  | CacheError
