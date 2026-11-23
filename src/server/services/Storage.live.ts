import { Effect, Layer, Option } from 'effect'
import { ConfigError, StorageError } from '../errors'
import { AppConfig } from './AppConfig'
import { attachmentDisposition, presign } from './r2Presign'
import { type ObjectInfo, Storage } from './Storage'

const info = (o: R2Object): ObjectInfo => ({
  key: o.key,
  size: o.size,
  etag: o.etag,
  contentType: o.httpMetadata?.contentType ?? null,
  uploadedAt: o.uploaded,
})

/** Storage backed by the R2 binding (`R2_FILES_BUCKET`); presigned URLs use the S3 API credentials in AppConfig. */
export const layer = (bucket: R2Bucket) =>
  Layer.effect(
    Storage,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const presignConfig = Effect.fromOption(config.r2Presign).pipe(
        Effect.mapError(() => new ConfigError({ message: 'R2 presign credentials are not configured' })),
      )
      const r2 = <A>(operation: StorageError['operation'], key: string, f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new StorageError({ operation, key, cause }) })

      return Storage.of({
        head: (key) => r2('head', key, () => bucket.head(key)).pipe(Effect.map((o) => Option.fromNullishOr(o).pipe(Option.map(info)))),
        get: (key) =>
          r2('get', key, () => bucket.get(key)).pipe(
            Effect.map((o) => Option.fromNullishOr(o).pipe(Option.map((body) => ({ ...info(body), body: body.body })))),
          ),
        put: (key, body, options) =>
          r2('put', key, () =>
            bucket.put(key, body, options?.contentType ? { httpMetadata: { contentType: options.contentType } } : {}),
          ).pipe(Effect.map(info)),
        delete: (keys) => (keys.length === 0 ? Effect.void : r2('delete', keys.join(','), () => bucket.delete([...keys]))),
        presignUpload: (key, options) =>
          Effect.flatMap(presignConfig, (c) =>
            presign(c, {
              method: 'PUT',
              key,
              expiresInSeconds: options.expiresInSeconds,
              ...(options.contentType ? { headers: { 'content-type': options.contentType } } : {}),
            }),
          ),
        presignDownload: (key, options) =>
          Effect.flatMap(presignConfig, (c) =>
            presign(c, {
              method: 'GET',
              key,
              expiresInSeconds: options.expiresInSeconds,
              ...(options.downloadFilename
                ? { query: { 'response-content-disposition': attachmentDisposition(options.downloadFilename) } }
                : {}),
            }),
          ),
      })
    }),
  )
