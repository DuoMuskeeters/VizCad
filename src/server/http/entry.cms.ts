import { Effect, Layer } from 'effect'
import type { Locale } from '#/i18n/locales'
import type { AuthorPage, PostList, PostResult } from '#/shared/blogTypes'
import { AppConfig } from '../services/AppConfig'
import { liveLayers } from '../services/live'
import { blogImageResponse } from './blogImage'
import { authorPage, blogListPage, type PageResult, postPage } from './blogPages'
import { cmsResponse } from './cms'
import { legacyAuthorResponse } from './legacyAuthor'
import { requestMeta } from './respond'
import { type SeoFile, seoFileResponse } from './seoFiles'

/** `/api/cms/*`: admin CMS API (http/cms.ts). Only the layers its operations read are built. */
export const handleCms = (request: Request, env: Cloudflare.Env): Promise<Response> => {
  const live = liveLayers(env)
  return Effect.runPromise(
    cmsResponse(request, Layer.mergeAll(live.db, live.auth, live.rateLimit, live.config, live.cache), requestMeta(request)),
  )
}

/** robots.txt, sitemaps, RSS and llms.txt (http/seoFiles.ts): config and D1 (robots reads no D1). */
export const handleSeoFile = (request: Request, env: Cloudflare.Env, file: SeoFile): Promise<Response> => {
  const live = liveLayers(env)
  return Effect.runPromise(seoFileResponse(file, Layer.mergeAll(live.config, live.db), requestMeta(request)))
}

/** What every marketing page's head needs from config: the site origin for canonical, hreflang and JSON-LD. */
export type SiteInfo = { readonly ok: true; readonly siteOrigin: string } | { readonly ok: false }

/**
 * Loaded by the `{-$locale}` layout's server function. A config failure is `{ ok: false }` (the page then renders without
 * canonical and opts out of the edge cache), logged by tag only.
 */
export const loadSiteInfo = (env: Cloudflare.Env): Promise<SiteInfo> =>
  Effect.runPromise(
    AppConfig.pipe(
      Effect.map(({ siteUrl }): SiteInfo => ({ ok: true, siteOrigin: siteUrl.origin })),
      Effect.provide(liveLayers(env).config),
      Effect.catch((error) => Effect.logError('site info failed').pipe(Effect.annotateLogs({ tag: error._tag }), Effect.as<SiteInfo>({ ok: false }))),
    ),
  )

export type { AuthorPage, PageResult, PostList, PostResult }

const publicLayer = (env: Cloudflare.Env) => {
  const live = liveLayers(env)
  return Layer.mergeAll(live.config, live.db)
}

/** Blog list page `n` (http/blogPages.ts): config and D1 only. */
export const loadBlogList = (env: Cloudflare.Env, locale: Locale, n: number): Promise<PageResult<PostList>> =>
  Effect.runPromise(blogListPage(locale, n, publicLayer(env)))

/** One post, or a 301 to its current slug. */
export const loadPost = (env: Cloudflare.Env, locale: Locale, slug: string): Promise<PageResult<PostResult>> =>
  Effect.runPromise(postPage(locale, slug, publicLayer(env)))

export const loadAuthor = (env: Cloudflare.Env, locale: Locale, slug: string): Promise<PageResult<AuthorPage>> =>
  Effect.runPromise(authorPage(locale, slug, publicLayer(env)))

/** `/api/blog/image/*` (http/blogImage.ts): R2 only. */
export const handleBlogImage = (request: Request, env: Cloudflare.Env): Promise<Response> =>
  Effect.runPromise(blogImageResponse(request, liveLayers(env).storage, requestMeta(request)))

/** `/author/{userId}` (http/legacyAuthor.ts): D1 only. */
export const handleLegacyAuthor = (request: Request, env: Cloudflare.Env): Promise<Response> =>
  Effect.runPromise(legacyAuthorResponse(request, liveLayers(env).db, requestMeta(request)))
