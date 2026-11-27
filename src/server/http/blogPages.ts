import { Effect, type Layer } from 'effect'
import type { Locale } from '#/i18n/locales'
import type { AppError } from '../errors'
import type { AuthorPage, PostList, PostResult } from '#/shared/blogTypes'
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

export const blogListPage = (locale: Locale, n: number, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<PostList>> =>
  page('listPublicPosts', listPublicPosts(locale, n), layer)

export const postPage = (locale: Locale, slug: string, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<PostResult>> =>
  page('getPublicPost', getPublicPost(locale, slug), layer)

export const authorPage = (locale: Locale, slug: string, layer: Layer.Layer<Db | AppConfig, AppError>): Effect.Effect<PageResult<AuthorPage>> =>
  page('getPublicAuthor', getPublicAuthor(locale, slug), layer)
