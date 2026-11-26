import { Effect, type Layer, Schema } from 'effect'
import { type AppError, ResourceUnavailable, ValidationError } from '../errors'
import { MAX_THUMBNAIL_BYTES } from '../deliveryHttp'
import { DerivativeStats, derivativeFailureCodes } from '../derivative'
import { type Delivery, deliverContent, deliverModel, deliverThumbnail, putThumbnail } from '../programs/delivery'
import { completeDerivative, failDerivative, startDerivative } from '../programs/derivatives'
import { AppConfig } from '../services/AppConfig'
import type { Auth } from '../services/Auth'
import type { Db } from '../services/Db'
import type { Entitlements } from '../services/Entitlements'
import type { RateLimit } from '../services/RateLimit'
import type { Storage } from '../services/Storage'
import { readBinaryBody, readBody } from './body'
import { checkMutationRequest, checkReadRequest } from './csrf'
import { handle, type RequestMeta } from './respond'
import { readCaller } from './session'

export type FilesServices = Db | Auth | AppConfig | Storage | RateLimit | Entitlements

/** `/api/files/{fileId}/content|model|thumbnail` and `/api/files/{fileId}/derivative/start|complete|failed`. */
const PATH = /^\/api\/files\/([^/]+)\/(content|model|thumbnail|derivative\/start|derivative\/complete|derivative\/failed)$/

const VersionNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 }))
const Bytes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))

/** Derivative bodies (docs/11 §2.3). Unknown properties fail: a client cannot offer a key, a size the server measures, or meta beyond the stats. */
const derivativeBodies = {
  'derivative/start': Schema.Struct({ version: VersionNumber, size: Bytes }),
  'derivative/complete': Schema.Struct({ sessionId: Id, etag: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)), stats: DerivativeStats }),
  'derivative/failed': Schema.Struct({ version: VersionNumber, code: Schema.Literals(derivativeFailureCodes) }),
} as const

const decodeBody = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

/** `?expect=` of a thumbnail POST: the version number the image was rendered from. */
const decodeExpected = (value: string | null) =>
  Schema.decodeUnknownEffect(Schema.NumberFromString.pipe(Schema.decodeTo(VersionNumber)))(value ?? '').pipe(
    Effect.mapError(() => new ValidationError({ message: 'invalid expected version' })),
  )

const FileId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^[A-Za-z0-9_-]+$/))

const decodeId = (value: string) =>
  Schema.decodeUnknownEffect(FileId)(value).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid id' })))

/** Bytes (or a 416 with no body) exactly as the program decided; the status and headers are not touched here. */
export const deliveryResponse = (delivery: Delivery) =>
  new Response(delivery.body as BodyInit | null, { status: delivery.status, headers: delivery.headers as HeadersInit })

const sealed = (data: unknown) =>
  Response.json({ ok: true, data }, { status: 200, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })

/**
 * File delivery for signed-in members (docs/09 §3.1, docs/11 §2.4). GET content, model and thumbnail: same-origin only (`checkReadRequest`),
 * session, then the program (permission, audit, stream). POST thumbnail: the CSRF check for a mutation with an image body
 * (PNG or WebP, at most 1 MiB, cut off while reading) and `?expect=` (the version it was rendered from). POST
 * derivative/start|complete|failed: the CSRF check for a JSON mutation, the body schema, then the program (docs/11 §2.3).
 * Unknown paths are 404; an unknown `v` is the program's 404.
 */
export const filesProgram = (request: Request) =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    const match = PATH.exec(url.pathname)
    if (match === null) return yield* new ResourceUnavailable()
    const fileId = yield* decodeId(match[1] ?? '').pipe(Effect.mapError(() => new ResourceUnavailable()))
    const kind = match[2]
    const version = url.searchParams.get('v') ?? 'current'
    const { trustedOrigins } = yield* AppConfig

    if (request.method === 'POST' && kind === 'thumbnail') {
      yield* checkMutationRequest(request, trustedOrigins, ['image/png', 'image/webp'])
      const { caller } = yield* readCaller(request)
      const expectedVersion = yield* decodeExpected(url.searchParams.get('expect'))
      const bytes = yield* readBinaryBody(request, MAX_THUMBNAIL_BYTES)
      return sealed(yield* putThumbnail(caller, {
        fileId, version, expectedVersion, contentType: request.headers.get('content-type'), bytes,
      }))
    }
    if (kind === 'derivative/start' || kind === 'derivative/complete' || kind === 'derivative/failed') {
      yield* checkMutationRequest(request, trustedOrigins)
      const { caller } = yield* readCaller(request)
      const body = yield* readBody(request)
      if (kind === 'derivative/start') return sealed(yield* startDerivative(caller, { fileId, ...(yield* decodeBody(derivativeBodies[kind], body)) }))
      if (kind === 'derivative/complete') return sealed(yield* completeDerivative(caller, { fileId, ...(yield* decodeBody(derivativeBodies[kind], body)) }))
      return sealed(yield* failDerivative(caller, { fileId, ...(yield* decodeBody(derivativeBodies[kind], body)) }))
    }
    yield* checkReadRequest(request, trustedOrigins)
    const { caller } = yield* readCaller(request)
    if (version !== 'current') yield* decodeId(version)
    const range = request.headers.get('range')
    if (kind === 'model') {
      // The model is the current version only (docs/11 §2.4); an older one opens through `content`.
      if (version !== 'current') return yield* new ResourceUnavailable()
      return deliveryResponse(yield* deliverModel(caller, { fileId, range }))
    }
    return deliveryResponse(
      kind === 'content'
        ? yield* deliverContent(caller, { fileId, version, range })
        : yield* deliverThumbnail(caller, { fileId, version }),
    )
  })

export const filesResponse = (request: Request, layer: Layer.Layer<FilesServices, AppError>, meta: RequestMeta) =>
  handle(filesProgram(request), layer, meta)
