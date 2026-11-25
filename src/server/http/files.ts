import { Effect, type Layer, Schema } from 'effect'
import { type AppError, ResourceUnavailable, ValidationError } from '../errors'
import { MAX_THUMBNAIL_BYTES } from '../deliveryHttp'
import { type Delivery, deliverContent, deliverThumbnail, putThumbnail } from '../programs/delivery'
import { AppConfig } from '../services/AppConfig'
import type { Auth } from '../services/Auth'
import type { Db } from '../services/Db'
import type { RateLimit } from '../services/RateLimit'
import type { Storage } from '../services/Storage'
import { readBinaryBody } from './body'
import { checkMutationRequest, checkReadRequest } from './csrf'
import { handle, type RequestMeta } from './respond'
import { readCaller } from './session'

export type FilesServices = Db | Auth | AppConfig | Storage | RateLimit

/** `/api/files/{fileId}/content` and `/api/files/{fileId}/thumbnail`. */
const PATH = /^\/api\/files\/([^/]+)\/(content|thumbnail)$/

const FileId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^[A-Za-z0-9_-]+$/))

const decodeId = (value: string) =>
  Schema.decodeUnknownEffect(FileId)(value).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid id' })))

/** Bytes (or a 416 with no body) exactly as the program decided; the status and headers are not touched here. */
export const deliveryResponse = (delivery: Delivery) =>
  new Response(delivery.body as BodyInit | null, { status: delivery.status, headers: delivery.headers as HeadersInit })

const sealed = (data: unknown) =>
  Response.json({ ok: true, data }, { status: 200, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })

/**
 * File delivery for signed-in members (docs/09 §3.1). GET content and thumbnail: same-origin only (`checkReadRequest`),
 * session, then the program (permission, audit, stream). POST thumbnail: the CSRF check for a mutation with an image body
 * (PNG or WebP, at most 1 MiB, cut off while reading). Unknown paths are 404; an unknown `v` is the program's 404.
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
      const bytes = yield* readBinaryBody(request, MAX_THUMBNAIL_BYTES)
      return sealed(yield* putThumbnail(caller, {
        fileId, version, contentType: request.headers.get('content-type'), bytes,
      }))
    }
    yield* checkReadRequest(request, trustedOrigins)
    const { caller } = yield* readCaller(request)
    if (version !== 'current') yield* decodeId(version)
    return deliveryResponse(
      kind === 'content'
        ? yield* deliverContent(caller, { fileId, version, range: request.headers.get('range') })
        : yield* deliverThumbnail(caller, { fileId, version }),
    )
  })

export const filesResponse = (request: Request, layer: Layer.Layer<FilesServices, AppError>, meta: RequestMeta) =>
  handle(filesProgram(request), layer, meta)
