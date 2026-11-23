import { Context, Effect, Layer, Option, Ref } from 'effect'
import { type ConfigError, StorageError } from '../errors'
import { attachmentDisposition, checkExpiry, checkKey } from './r2Presign'

export interface ObjectInfo {
  readonly key: string
  readonly size: number
  readonly etag: string
  readonly contentType: string | null
  readonly uploadedAt: Date
}

export interface ObjectBody extends ObjectInfo {
  readonly body: ReadableStream<Uint8Array>
}

export type PutBody = ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string

export interface UploadUrlOptions {
  readonly expiresInSeconds: number
  /** When set, the browser must send exactly this Content-Type (it is part of the signature). */
  readonly contentType?: string
}

export interface DownloadUrlOptions {
  readonly expiresInSeconds: number
  /** When set, the browser saves the file under this name instead of showing it. */
  readonly downloadFilename?: string
}

/**
 * Object storage (R2 `vizcad-files-bucket`). Files move between the browser and R2 through presigned
 * URLs; the Worker only reads/writes small objects (thumbnails, blog images) through the binding.
 * Keys are stored in D1 (`files.r2Key`) and must never be renamed.
 * Live layer: Storage.live.ts. Test layer: `memory` below.
 */
export class Storage extends Context.Service<
  Storage,
  {
    readonly head: (key: string) => Effect.Effect<Option.Option<ObjectInfo>, StorageError>
    readonly get: (key: string) => Effect.Effect<Option.Option<ObjectBody>, StorageError>
    readonly put: (key: string, body: PutBody, options?: { readonly contentType?: string }) => Effect.Effect<ObjectInfo, StorageError>
    readonly delete: (keys: ReadonlyArray<string>) => Effect.Effect<void, StorageError>
    readonly presignUpload: (key: string, options: UploadUrlOptions) => Effect.Effect<URL, StorageError | ConfigError>
    readonly presignDownload: (key: string, options: DownloadUrlOptions) => Effect.Effect<URL, StorageError | ConfigError>
  }
>()('vizcad/Storage') {}

/** Copies any accepted body into bytes (the in-memory layer keeps its own copy). */
export const toBytes = (key: string, body: PutBody) => {
  if (typeof body === 'string') return Effect.succeed(new TextEncoder().encode(body))
  if (body instanceof Uint8Array) return Effect.succeed(body.slice())
  if (body instanceof ArrayBuffer) return Effect.succeed(new Uint8Array(body.slice(0)))
  return Effect.tryPromise({
    try: () => new Response(body).arrayBuffer(),
    catch: (cause) => new StorageError({ operation: 'put', key, cause }),
  }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))
}

interface MemoryObject {
  readonly info: ObjectInfo
  readonly bytes: Uint8Array
}

/**
 * In-memory Storage for tests. Presigned URLs point at `https://r2.memory.test/` and carry the method,
 * expiry and options as query parameters so tests can assert on them.
 */
export const memory = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const objects = yield* Ref.make(new Map<string, MemoryObject>())
    const writes = yield* Ref.make(0)

    const fakeUrl = (key: string, params: Record<string, string>) => {
      const url = new URL(`https://r2.memory.test/${key.split('/').map(encodeURIComponent).join('/')}`)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      return url
    }

    return Storage.of({
      head: (key) => Ref.get(objects).pipe(Effect.map((m) => Option.fromNullishOr(m.get(key)?.info))),
      get: (key) =>
        Ref.get(objects).pipe(
          Effect.map((m) =>
            Option.fromNullishOr(m.get(key)).pipe(
              Option.map(({ info, bytes }) => ({ ...info, body: new Blob([bytes.slice()]).stream() })),
            ),
          ),
        ),
      put: (key, body, options) =>
        Effect.gen(function* () {
          const bytes = yield* toBytes(key, body)
          const n = yield* Ref.updateAndGet(writes, (w) => w + 1)
          const info: ObjectInfo = {
            key,
            size: bytes.byteLength,
            etag: `etag-${n}`,
            contentType: options?.contentType ?? null,
            uploadedAt: new Date(yield* Effect.clockWith((c) => c.currentTimeMillis)),
          }
          yield* Ref.update(objects, (m) => new Map(m).set(key, { info, bytes }))
          return info
        }),
      delete: (keys) =>
        Ref.update(objects, (m) => {
          const next = new Map(m)
          for (const key of keys) next.delete(key)
          return next
        }),
      presignUpload: (key, options) =>
        checkKey(key).pipe(
          Effect.andThen(checkExpiry(key, options.expiresInSeconds)),
          Effect.as(
            fakeUrl(key, {
              method: 'PUT',
              expires: String(options.expiresInSeconds),
              ...(options.contentType ? { contentType: options.contentType } : {}),
            }),
          ),
        ),
      presignDownload: (key, options) =>
        checkKey(key).pipe(
          Effect.andThen(checkExpiry(key, options.expiresInSeconds)),
          Effect.as(
            fakeUrl(key, {
              method: 'GET',
              expires: String(options.expiresInSeconds),
              ...(options.downloadFilename ? { disposition: attachmentDisposition(options.downloadFilename) } : {}),
            }),
          ),
        ),
    })
  }),
)
