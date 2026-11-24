import { Clock, Context, Effect, Layer, Option, Ref } from 'effect'
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
  /** Exact body size in bytes. Signed as `content-length`: R2 refuses a PUT with any other size (docs/09 §2.4). */
  readonly contentLength: number
  /** Signed as `if-none-match: *`: R2 refuses the PUT when the key already exists, so a URL writes once. */
  readonly ifNoneMatch: '*'
}

/** A byte range of an object: `offset`/`length` from the start, or the last `suffix` bytes. */
export type ObjectRange = { readonly offset: number; readonly length: number } | { readonly suffix: number }

export interface GetOptions {
  readonly range?: ObjectRange
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
 * Live layer: Storage.live.ts. Test layer: `memory` below (with MemoryStorageControl for tests).
 */
export class Storage extends Context.Service<
  Storage,
  {
    readonly head: (key: string) => Effect.Effect<Option.Option<ObjectInfo>, StorageError>
    /** `size` is always the whole object's size, also for a range read. */
    readonly get: (key: string, options?: GetOptions) => Effect.Effect<Option.Option<ObjectBody>, StorageError>
    /** Reads a byte range (signature checks, 4c delivery). */
    readonly getRange: (key: string, range: ObjectRange) => Effect.Effect<Option.Option<ObjectBody>, StorageError>
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

/** Reads a whole body into bytes (for the small range reads signature checks make). */
export const readBytes = (key: string, body: ObjectBody) =>
  Effect.tryPromise({
    try: () => new Response(body.body).arrayBuffer(),
    catch: (cause) => new StorageError({ operation: 'get', key, cause }),
  }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))

/** The ETag without quotes or weak marker: the binding reports it bare, the browser's `ETag` header quotes it. */
export const normalizeEtag = (etag: string) => etag.trim().replace(/^W\//, '').replace(/^"|"$/g, '')

interface MemoryObject {
  readonly info: ObjectInfo
  readonly bytes: Uint8Array
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')

/** 32 hex characters of SHA-256, like an MD5 ETag: the same bytes always give the same value. */
const contentEtag = (bytes: Uint8Array) =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', bytes.slice())).pipe(Effect.map((digest) => hex(digest).slice(0, 32)))

const slice = (bytes: Uint8Array, range: ObjectRange | undefined) => {
  if (range === undefined) return bytes
  if ('suffix' in range) return bytes.slice(Math.max(0, bytes.length - range.suffix))
  return bytes.slice(range.offset, range.offset + range.length)
}

export interface BrowserPutResult {
  /** 200 stored, 403 signature mismatch (size, header or expiry), 412 key already exists. */
  readonly status: 200 | 403 | 412
  /** Quoted, as in the `ETag` response header. */
  readonly etag?: string
}

/**
 * Test control over the in-memory bucket: what R2 does when a browser uses a presigned URL, and what the programs
 * did to the bucket. Provided together with Storage by `memory`.
 */
export class MemoryStorageControl extends Context.Service<
  MemoryStorageControl,
  {
    /** Applies the signed rules of an URL from `presignUpload`: exact `content-length`, `content-type`, `if-none-match: *`, expiry. */
    readonly simulateBrowserPut: (url: URL, bytes: Uint8Array, headers?: Readonly<Record<string, string>>) => Effect.Effect<BrowserPutResult>
    /** Names of the Storage operations called so far, in order (e.g. to prove `presignDownload` is never used). */
    readonly calls: Effect.Effect<ReadonlyArray<string>>
    /** Keys currently in the bucket. */
    readonly keys: Effect.Effect<ReadonlyArray<string>>
    /** Makes every later `delete` fail (an R2 outage), or works again with `false`. */
    readonly failDeletes: (fail: boolean) => Effect.Effect<void>
  }
>()('vizcad/MemoryStorageControl') {}

interface MemoryState {
  readonly objects: Map<string, MemoryObject>
  readonly calls: ReadonlyArray<string>
  readonly deletesFail: boolean
}

/**
 * In-memory Storage for tests. Presigned URLs point at `https://r2.memory.test/` and carry the method, expiry and
 * signed options as query parameters; `MemoryStorageControl.simulateBrowserPut` enforces them like R2 would.
 */
export const memory = Layer.effectContext(
  Effect.gen(function* () {
    const state = yield* Ref.make<MemoryState>({ objects: new Map(), calls: [], deletesFail: false })
    const call = (name: string) => Ref.update(state, (s) => ({ ...s, calls: [...s.calls, name] }))
    const store = (key: string, bytes: Uint8Array, contentType: string | null) =>
      Effect.gen(function* () {
        const info: ObjectInfo = {
          key,
          size: bytes.byteLength,
          etag: yield* contentEtag(bytes),
          contentType,
          uploadedAt: new Date(yield* Clock.currentTimeMillis),
        }
        yield* Ref.update(state, (s) => ({ ...s, objects: new Map(s.objects).set(key, { info, bytes: bytes.slice() }) }))
        return info
      })

    const fakeUrl = (key: string, params: Record<string, string>) => {
      const url = new URL(`https://r2.memory.test/${key.split('/').map(encodeURIComponent).join('/')}`)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      return url
    }
    const lookup = (key: string, range: ObjectRange | undefined) =>
      Ref.get(state).pipe(
        Effect.map((s) =>
          Option.fromNullishOr(s.objects.get(key)).pipe(
            Option.map(({ info, bytes }) => ({ ...info, body: new Blob([slice(bytes, range).slice()]).stream() })),
          ),
        ),
      )

    const storage = Storage.of({
      head: (key) => call('head').pipe(Effect.andThen(Ref.get(state)), Effect.map((s) => Option.fromNullishOr(s.objects.get(key)?.info))),
      get: (key, options) => call('get').pipe(Effect.andThen(lookup(key, options?.range))),
      getRange: (key, range) => call('getRange').pipe(Effect.andThen(lookup(key, range))),
      put: (key, body, options) =>
        call('put').pipe(Effect.andThen(toBytes(key, body)), Effect.flatMap((bytes) => store(key, bytes, options?.contentType ?? null))),
      delete: (keys) =>
        call('delete').pipe(
          Effect.andThen(Ref.get(state)),
          Effect.flatMap((s) =>
            s.deletesFail
              ? Effect.fail(new StorageError({ operation: 'delete', key: keys.join(','), cause: 'simulated outage' }))
              : Ref.update(state, (current) => {
                const next = new Map(current.objects)
                for (const key of keys) next.delete(key)
                return { ...current, objects: next }
              }),
          ),
        ),
      presignUpload: (key, options) =>
        call('presignUpload').pipe(
          Effect.andThen(checkKey(key)),
          Effect.andThen(checkExpiry(key, options.expiresInSeconds)),
          Effect.andThen(Clock.currentTimeMillis),
          Effect.map((now) =>
            fakeUrl(key, {
              method: 'PUT',
              expires: String(options.expiresInSeconds),
              expiresAt: String(now + options.expiresInSeconds * 1000),
              contentLength: String(options.contentLength),
              ifNoneMatch: options.ifNoneMatch,
              ...(options.contentType ? { contentType: options.contentType } : {}),
            }),
          ),
        ),
      presignDownload: (key, options) =>
        call('presignDownload').pipe(
          Effect.andThen(checkKey(key)),
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

    const control = MemoryStorageControl.of({
      simulateBrowserPut: (url, bytes, headers = {}) =>
        Effect.gen(function* () {
          const sent = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))
          const params = url.searchParams
          const key = decodeURIComponent(url.pathname.slice(1))
          const now = yield* Clock.currentTimeMillis
          const signedType = params.get('contentType')
          const mismatch = params.get('method') !== 'PUT'
            || now > Number(params.get('expiresAt'))
            || bytes.byteLength !== Number(params.get('contentLength'))
            || (params.get('ifNoneMatch') !== null && sent.get('if-none-match') !== params.get('ifNoneMatch'))
            || (signedType !== null && sent.get('content-type') !== signedType)
          if (mismatch) return { status: 403 } as const
          if ((yield* Ref.get(state)).objects.has(key)) return { status: 412 } as const
          const info = yield* store(key, bytes, signedType)
          return { status: 200, etag: `"${info.etag}"` } as const
        }),
      calls: Ref.get(state).pipe(Effect.map((s) => s.calls)),
      keys: Ref.get(state).pipe(Effect.map((s) => [...s.objects.keys()])),
      failDeletes: (fail) => Ref.update(state, (s) => ({ ...s, deletesFail: fail })),
    })

    return Context.make(Storage, storage).pipe(Context.add(MemoryStorageControl, control))
  }),
)
