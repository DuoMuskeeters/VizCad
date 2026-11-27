import { Effect, type Layer } from 'effect'
import type { Locale } from '#/i18n/locales'
import type { AppError } from '../errors'
import { robotsTxt, sitemapIndexXml, sitemapXml } from '../programs/cms/public'
import type { AppConfig } from '../services/AppConfig'
import { handle, type RequestMeta } from './respond'

export type SeoFile = { readonly kind: 'robots' } | { readonly kind: 'sitemapIndex' } | { readonly kind: 'sitemap'; readonly locale: Locale }

const types = { robots: 'text/plain; charset=utf-8', sitemapIndex: 'application/xml; charset=utf-8', sitemap: 'application/xml; charset=utf-8' } as const

/**
 * `/robots.txt`, `/sitemap.xml`, `/sitemaps/{locale}.xml`. Marketing paths: on the site origin src/server.ts caches the
 * 200 at the edge and rewrites the browser's Cache-Control, so the header here only matters off the site origin.
 */
export const seoFileResponse = (file: SeoFile, layer: Layer.Layer<AppConfig, AppError>, meta: RequestMeta) =>
  handle(
    (file.kind === 'robots' ? robotsTxt : file.kind === 'sitemapIndex' ? sitemapIndexXml : sitemapXml(file.locale)).pipe(
      Effect.map((body) =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': types[file.kind], 'cache-control': 'public, max-age=0, must-revalidate', 'x-content-type-options': 'nosniff' },
        }),
      ),
    ),
    layer,
    meta,
  )
