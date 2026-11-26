import { Effect, type Layer, Schema } from 'effect'
import { type AppError, ResourceUnavailable, ValidationError } from '../errors'
import { deliverLinkContent, deliverLinkModel, deliverLinkThumbnail, type LinkRequest, resolveShareLink, verifyLinkPassword } from '../programs/shareLinks'
import { AppConfig } from '../services/AppConfig'
import type { Db } from '../services/Db'
import type { Entitlements } from '../services/Entitlements'
import type { RateLimit } from '../services/RateLimit'
import type { Storage } from '../services/Storage'
import type { Turnstile } from '../services/Turnstile'
import { readBody } from './body'
import { checkMutationRequest, checkReadRequest } from './csrf'
import { deliveryResponse } from './files'
import { handle, type RequestMeta } from './respond'

export type ShareServices = Db | AppConfig | Storage | RateLimit | Turnstile | Entitlements

/** `/s/{token}/content`, `/s/{token}/model`, `/s/{token}/thumbnail`, `POST /api/s/resolve`, `POST /api/s/password`. */
const DELIVERY_PATH = /^\/s\/([^/]+)\/(content|model|thumbnail)$/
const API_PREFIX = '/api/s/'

const Token = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const ResolveBody = Schema.Struct({ token: Token })
const PasswordBody = Schema.Struct({
  token: Token,
  password: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  turnstileToken: Schema.optional(Schema.String.check(Schema.isMaxLength(2048))),
})

const decode = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

const linkRequest = (request: Request): LinkRequest => ({
  requestId: request.headers.get('cf-ray') ?? 'none',
  ip: request.headers.get('cf-connecting-ip'),
  userAgent: request.headers.get('user-agent'),
  cookie: request.headers.get('cookie'),
})

const json = (data: unknown, setCookie: string | null = null) => {
  const headers = new Headers({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })
  if (setCookie !== null) headers.append('set-cookie', setCookie)
  return Response.json({ ok: true, data }, { status: 200, headers })
}

/**
 * Link endpoints (docs/09 §4): no session, no application cookie reads; the only credential is the token in the path or
 * body, plus the password proof cookie. No endpoint takes a query string (a password in the URL is a 400, not a feature).
 * The POSTs go through the CSRF boundary; the GETs accept same-origin requests only, so another site cannot make a visitor's
 * browser write download records.
 */
export const shareProgram = (request: Request) =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    if (url.search !== '') return yield* new ValidationError({ message: 'no query string' })
    const { trustedOrigins } = yield* AppConfig
    const visitor = linkRequest(request)

    const delivery = DELIVERY_PATH.exec(url.pathname)
    if (delivery !== null) {
      yield* checkReadRequest(request, trustedOrigins)
      const token = delivery[1] ?? ''
      const range = request.headers.get('range')
      return deliveryResponse(
        delivery[2] === 'content'
          ? yield* deliverLinkContent(visitor, token, range)
          : delivery[2] === 'model'
            ? yield* deliverLinkModel(visitor, token, range)
            : yield* deliverLinkThumbnail(visitor, token),
      )
    }

    const name = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : ''
    if (name !== 'resolve' && name !== 'password') return yield* new ResourceUnavailable()
    yield* checkMutationRequest(request, trustedOrigins)
    const body = yield* readBody(request)
    if (name === 'resolve') return json(yield* resolveShareLink(visitor, (yield* decode(ResolveBody, body)).token))
    const input = yield* decode(PasswordBody, body)
    const proven = yield* verifyLinkPassword(visitor, {
      token: input.token, password: input.password, turnstileToken: input.turnstileToken,
    })
    return json({ verified: true }, proven.setCookie)
  })

/** Everything under /s and /api/s: never cached, no referrer (the token is in the URL), never sniffed. */
const withLinkHeaders = (response: Response) => {
  const headers = new Headers(response.headers)
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('cache-control', 'private, no-store')
  return new Response(response.body, { status: response.status, headers })
}

export const shareResponse = (request: Request, layer: Layer.Layer<ShareServices, AppError>, meta: RequestMeta) =>
  handle(shareProgram(request), layer, meta).pipe(Effect.map(withLinkHeaders))
