import { AwsClient } from 'aws4fetch'
import { Clock, Effect, Redacted } from 'effect'
import { StorageError } from '../errors'
import type { R2Presign } from './AppConfig'

/** S3 allows at most 7 days for a presigned URL. */
export const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60

/**
 * RFC 3986 encoding of one key segment. The old app concatenated raw keys into the URL, so a file name
 * with `#`, `?` or `+` produced a URL for a different key; every segment is encoded here instead.
 */
const encodeSegment = (segment: string) =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** Path-style S3 URL for an object key. Keys are used byte-for-byte; never rename R2 keys. */
export const objectUrl = (config: R2Presign, key: string) => {
  const base = `${config.endpoint.origin}${config.endpoint.pathname.replace(/\/+$/, '')}`
  return new URL(`${base}/${encodeSegment(config.bucketName)}/${key.split('/').map(encodeSegment).join('/')}`)
}

/** Fails unless the expiry is a whole number of seconds S3 accepts. */
export const checkExpiry = (key: string, seconds: number) =>
  Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_EXPIRES_SECONDS
    ? Effect.void
    : Effect.fail(
        new StorageError({ operation: 'presign', key, cause: `expiresInSeconds must be an integer in 1..${MAX_EXPIRES_SECONDS}` }),
      )

/** `20261123T100000Z`, the SigV4 timestamp format. */
const amzDate = (millis: number) => new Date(millis).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export interface PresignRequest {
  readonly method: 'GET' | 'PUT'
  readonly key: string
  readonly expiresInSeconds: number
  /** Signed headers the client must send unchanged (e.g. Content-Type on upload). */
  readonly headers?: Readonly<Record<string, string>>
  /** Extra query parameters to sign (e.g. response-content-disposition on download). */
  readonly query?: Readonly<Record<string, string>>
}

/** Signs a URL with SigV4 query parameters. Pure apart from Clock: no network call is made. */
export const presign = Effect.fnUntraced(function* (config: R2Presign, request: PresignRequest) {
  yield* checkExpiry(request.key, request.expiresInSeconds)
  const now = yield* Clock.currentTimeMillis
  const url = objectUrl(config, request.key)
  url.searchParams.set('X-Amz-Expires', String(request.expiresInSeconds))
  for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value)

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: Redacted.value(config.secretAccessKey),
    service: 's3',
    region: 'auto',
  })
  const signed = yield* Effect.tryPromise({
    try: () =>
      client.sign(url, {
        method: request.method,
        ...(request.headers ? { headers: request.headers } : {}),
        // allHeaders: aws4fetch skips Content-Type by default; we want it bound to the signature.
        aws: { signQuery: true, allHeaders: true, datetime: amzDate(now) },
      }),
    catch: (cause) => new StorageError({ operation: 'presign', key: request.key, cause }),
  })
  return new URL(signed.url)
})

/** `attachment; filename="..."; filename*=UTF-8''...` with an ASCII fallback for old clients. */
export const attachmentDisposition = (filename: string) => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeSegment(filename)}`
}
