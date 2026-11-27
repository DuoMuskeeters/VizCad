import { Effect, type Layer, Schema } from 'effect'
import { type AppError, PermissionDenied, ResourceUnavailable, ValidationError } from '../errors'
import { decideContent } from '../permissions'
import { drainPurges, listPurges, purgeSiteHost, purgeUrls } from '../programs/cms/cache'
import { AppConfig } from '../services/AppConfig'
import type { Auth } from '../services/Auth'
import type { Cache } from '../services/Cache'
import type { Db } from '../services/Db'
import { RateLimit } from '../services/RateLimit'
import { readBody } from './body'
import { checkMutationRequest } from './csrf'
import { handle, type RequestMeta } from './respond'
import { readCaller } from './session'

export type CmsServices = Db | Auth | RateLimit | AppConfig | Cache

type Decodable = Schema.Top & { readonly DecodingServices: never }
type Fields = { readonly [key: string]: Decodable }

interface Operation {
  /** Writes count against the `cmsWrite` limit (per admin and per IP) before the body is read. */
  readonly write: boolean
  readonly run: (body: unknown) => Effect.Effect<unknown, AppError, CmsServices>
}

const decode = <S extends Decodable>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

const op = <F extends Fields>(write: boolean, fields: F, run: (input: Schema.Struct<F>['Type']) => Effect.Effect<unknown, AppError, CmsServices>): Operation => ({
  write,
  run: (body) => decode(Schema.Struct(fields), body).pipe(Effect.flatMap(run)),
})

/**
 * An operation without input. `Schema.Struct({})` accepts any object (and arrays) even with `onExcessProperty: 'error'`,
 * so the body must be an object with no keys: a record whose values can never decode.
 */
const NoBody = Schema.Record(Schema.String, Schema.Never)
const noInput = (write: boolean, run: () => Effect.Effect<unknown, AppError, CmsServices>): Operation => ({
  write,
  run: (body) => decode(NoBody, body).pipe(Effect.flatMap(run)),
})

const AbsoluteUrl = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048))

/**
 * Only what 6a needs: the cache screen's queue and purges (docs/12 §3.2 `listPurges`, `drainPurges`, `purgeUrls`, plus a
 * site hostname purge). Posts, authors, texts, SEO, legal and assets join in 6c–6e.
 */
const operations: Readonly<Record<string, Operation>> = {
  listPurges: op(false, { limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))) }, (input) =>
    listPurges({ limit: input.limit ?? 50 })),
  drainPurges: noInput(true, () => drainPurges()),
  purgeUrls: op(true, { urls: Schema.Array(AbsoluteUrl).check(Schema.isMinLength(1), Schema.isMaxLength(100)) }, (input) => purgeUrls(input)),
  purgeHost: noInput(true, () => purgeSiteHost()),
}

export const cmsOperationNames = Object.keys(operations)

const PREFIX = '/api/cms/'

const sealed = (data: unknown) =>
  Response.json({ ok: true, data }, { status: 200, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })

/**
 * `POST /api/cms/<operation>`: the admin CMS API (docs/12 §3.2). Order: known operation (else 404) -> CSRF (POST,
 * trusted Origin, same-origin fetch, JSON) -> session (401; a suspended account counts as none) -> `canManageContent`
 * (403 `PermissionDenied`) -> `cmsWrite` rate limit for writes -> body schema (400) -> program. Never cached.
 */
export const cmsProgram = (request: Request) =>
  Effect.gen(function* () {
    const { pathname } = new URL(request.url)
    const name = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : ''
    const operation = Object.hasOwn(operations, name) ? operations[name] : undefined
    if (operation === undefined) return yield* new ResourceUnavailable()
    const { trustedOrigins } = yield* AppConfig
    yield* checkMutationRequest(request, trustedOrigins)
    const { caller, session } = yield* readCaller(request)
    const decision = decideContent(session)
    if (!decision.allowed) return yield* new PermissionDenied({ reason: decision.reason })
    if (operation.write) {
      const limiter = yield* RateLimit
      yield* limiter.hit({ action: 'cmsWrite', ip: caller.ip })
      yield* limiter.hit({ action: 'cmsWrite', target: caller.userId })
    }
    const body = yield* readBody(request)
    return sealed(yield* operation.run(body))
  })

export const cmsResponse = (request: Request, layer: Layer.Layer<CmsServices, AppError>, meta: RequestMeta) =>
  handle(cmsProgram(request), layer, meta)
