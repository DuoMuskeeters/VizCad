import { Effect, type Layer, Schema } from 'effect'
import { type AppError, PermissionDenied, ResourceUnavailable, ValidationError } from '../errors'
import { decideContent } from '../permissions'
import { LOCALES } from '#/i18n/locales'
import { drainPurges, listPurges, purgeSiteHost, purgeUrls } from '../programs/cms/cache'
import {
  archivePost,
  createPost,
  deletePost,
  getPostAdmin,
  listPostsAdmin,
  previewDraft,
  publishTranslation,
  restorePost,
  saveDraft,
  unpublishTranslation,
  updatePostMeta,
} from '../programs/cms/posts'
import type { Caller } from '../programs/shared'
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
  /** Body cap in bytes (default 16 KiB); a post draft carries its markdown. */
  readonly maxBytes?: number
  readonly run: (body: unknown, caller: Caller) => Effect.Effect<unknown, AppError, CmsServices>
}

const decode = <S extends Decodable>(schema: S, body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body, { onExcessProperty: 'error' }).pipe(Effect.mapError(() => new ValidationError({ message: 'invalid request body' })))

const op = <F extends Fields>(
  write: boolean,
  fields: F,
  run: (input: Schema.Struct<F>['Type'], caller: Caller) => Effect.Effect<unknown, AppError, CmsServices>,
  maxBytes?: number,
): Operation => ({
  write,
  ...(maxBytes === undefined ? {} : { maxBytes }),
  run: (body, caller) => decode(Schema.Struct(fields), body).pipe(Effect.flatMap((input) => run(input, caller))),
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
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const Locale = Schema.Literals(LOCALES)
const Revision = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
/**
 * Loose caps at the boundary (well above the field limits): the programs check the real limits and answer
 * `TextTooLong` with the field, so the editor can show it under the field instead of a bare 400.
 */
const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max))
const OptionalText = (max: number) => Schema.NullOr(Text(max))
const DraftFields = Schema.Struct({
  slug: Text(1024),
  title: Text(1000),
  excerpt: Text(3000),
  contentMd: Text(256 * 1024),
  metaTitle: OptionalText(1000),
  metaDescription: OptionalText(3000),
  keywords: Schema.Array(Text(1000)).check(Schema.isMaxLength(100)),
  coverAlt: OptionalText(2000),
  ogAssetId: Schema.NullOr(Id),
})
/** A draft carries up to `POST_LIMITS.contentMd` of markdown (JSON escaping can double it); larger bodies are 413. */
const DRAFT_BODY_BYTES = 192 * 1024
const PostId = { postId: Id }

/**
 * The cache screen's queue and purges (6a: docs/12 §3.2 `listPurges`, `drainPurges`, `purgeUrls`, plus a site hostname
 * purge) and the posts (6c). Authors, images, texts, SEO and legal join in 6c-2–6e.
 */
const operations: Readonly<Record<string, Operation>> = {
  listPurges: op(false, { limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))) }, (input) =>
    listPurges({ limit: input.limit ?? 50 })),
  drainPurges: noInput(true, () => drainPurges()),
  purgeUrls: op(true, { urls: Schema.Array(AbsoluteUrl).check(Schema.isMinLength(1), Schema.isMaxLength(100)) }, (input) => purgeUrls(input)),
  purgeHost: noInput(true, () => purgeSiteHost()),

  // Posts (6c).
  listPostsAdmin: op(
    false,
    {
      status: Schema.optional(Schema.Literals(['draft', 'published', 'archived'])),
      missingLocale: Schema.optional(Locale),
      q: Schema.optional(Text(200)),
      cursor: Schema.optional(Text(100)),
    },
    (input) => listPostsAdmin(input),
  ),
  getPostAdmin: op(false, PostId, (input) => getPostAdmin(input.postId)),
  createPost: op(true, { title: Text(1000) }, (input, caller) => createPost(input, caller)),
  saveDraft: op(true, { postId: Id, locale: Locale, fields: DraftFields, revision: Revision }, (input, caller) => saveDraft(input, caller), DRAFT_BODY_BYTES),
  updatePostMeta: op(
    true,
    {
      postId: Id,
      category: Text(1000),
      tags: Schema.Array(Text(1000)).check(Schema.isMaxLength(100)),
      authorId: Id,
      coverAssetId: Schema.NullOr(Id),
      removeCover: Schema.optional(Schema.Boolean),
      featured: Schema.Boolean,
      tableOfContents: Schema.Boolean,
      revision: Revision,
    },
    (input, caller) => updatePostMeta(input, caller),
  ),
  // Renders markdown (CPU): rate limited like a write.
  previewDraft: op(true, { postId: Id, locale: Locale }, (input) => previewDraft(input)),
  publishTranslation: op(true, { postId: Id, locale: Locale, revision: Revision }, (input, caller) => publishTranslation(input, caller)),
  unpublishTranslation: op(true, { postId: Id, locale: Locale, confirm: Schema.optional(Schema.Boolean) }, (input, caller) =>
    unpublishTranslation({ ...input, confirm: input.confirm ?? false }, caller)),
  archivePost: op(true, PostId, (input, caller) => archivePost(input, caller)),
  restorePost: op(true, PostId, (input, caller) => restorePost(input, caller)),
  deletePost: op(true, PostId, (input) => deletePost(input)),
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
    const body = yield* readBody(request, operation.maxBytes)
    return sealed(yield* operation.run(body, caller))
  })

export const cmsResponse = (request: Request, layer: Layer.Layer<CmsServices, AppError>, meta: RequestMeta) =>
  handle(cmsProgram(request), layer, meta)
