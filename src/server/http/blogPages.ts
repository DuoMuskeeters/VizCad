import { Effect, type Layer, Schema } from 'effect'
import { LOCALES } from '#/i18n/locales'
import { type AppError, AuthorUnavailable, PageUnavailable, PostUnavailable } from '../errors'
import type { AuthorPage, PostList, PostResult } from '#/shared/blogTypes'
import { BLOG_PAGE_MAX, BLOG_SLUG_MAX } from '#/shared/marketingRoutes'
import { getPublicAuthor, getPublicPost, listPublicPosts } from '../programs/cms/blog'
import { AppConfig } from '../services/AppConfig'
import type { Db } from '../services/Db'

/**
 * Data for the public blog pages (routes `{-$locale}/blog/*`, `{-$locale}/authors/$slug`), returned to the route's
 * server function as plain serializable values: the page, or the status the route answers with. Expected outcomes
 * (404, 410) are values, not failures; anything else (D1, config) is a 500 that the route keeps out of the edge cache.
 * Logs carry the tag only.
 */
export type PageResult<A> =
  | { readonly ok: true; readonly siteOrigin: string; readonly data: A }
  | { readonly ok: false; readonly status: 404 | 410 | 500 }

/**
 * The server function inputs (route params, or anything posted to the RPC endpoint). Input outside these limits is a
 * 404, never a 500: the routes check the same limits (`BLOG_PAGE_MAX`, `BLOG_SLUG_MAX`) before they call.
 */
const LocaleParam = Schema.Literals(LOCALES)
export const ListInput = Schema.Struct({ locale: LocaleParam, page: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BLOG_PAGE_MAX })) })
export const SlugInput = Schema.Struct({ locale: LocaleParam, slug: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(BLOG_SLUG_MAX)) })

const decode = <S extends Schema.Top & { readonly DecodingServices: never }, E>(schema: S, input: unknown, missing: () => E) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(missing))

const page = <A, R extends Db | AppConfig>(operation: string, program: Effect.Effect<A, AppError, R>, layer: Layer.Layer<R | AppConfig, AppError>) =>
  Effect.gen(function* () {
    const { siteUrl } = yield* AppConfig
    const data = yield* program
    return { ok: true, siteOrigin: siteUrl.origin, data } as PageResult<A>
  }).pipe(
    // Provided first, so a layer failure (config) is caught below like any other error.
    Effect.provide(layer),
    Effect.catch((error): Effect.Effect<PageResult<A>> => {
      switch (error._tag) {
        case 'PostUnavailable':
        case 'AuthorUnavailable':
        case 'PageUnavailable':
          return Effect.succeed({ ok: false, status: 404 })
        case 'PostGone':
          return Effect.succeed({ ok: false, status: 410 })
        default:
          return Effect.logError('blog page failed').pipe(Effect.annotateLogs({ tag: error._tag, operation }), Effect.as<PageResult<A>>({ ok: false, status: 500 }))
      }
    }),
  )

export const blogListPage = (input: unknown, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<PostList>> =>
  page(
    'listPublicPosts',
    decode(ListInput, input, () => new PageUnavailable()).pipe(Effect.flatMap(({ locale, page: n }) => listPublicPosts(locale, n))),
    layer,
  )

export const postPage = (input: unknown, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<PostResult>> =>
  page(
    'getPublicPost',
    decode(SlugInput, input, () => new PostUnavailable()).pipe(Effect.flatMap(({ locale, slug }) => getPublicPost(locale, slug))),
    layer,
  )

export const authorPage = (input: unknown, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<AuthorPage>> =>
  page(
    'getPublicAuthor',
    decode(SlugInput, input, () => new AuthorUnavailable()).pipe(Effect.flatMap(({ locale, slug }) => getPublicAuthor(locale, slug))),
    layer,
  )
