import { Effect, type Layer } from 'effect'
import type { Locale } from '#/i18n/locales'
import type { AppError } from '../errors'
import { llmsTxt, robotsTxt, rssXml, sitemapIndexXml, sitemapXml } from '../programs/cms/public'
import type { AppConfig } from '../services/AppConfig'
import type { Db } from '../services/Db'
import { handle, type RequestMeta } from './respond'

export type SeoFile =
  | { readonly kind: 'robots' }
  | { readonly kind: 'sitemapIndex' }
  | { readonly kind: 'sitemap'; readonly locale: Locale }
  | { readonly kind: 'rss'; readonly locale: Locale }
  | { readonly kind: 'llms' }

const types = {
  robots: 'text/plain; charset=utf-8',
  sitemapIndex: 'application/xml; charset=utf-8',
  sitemap: 'application/xml; charset=utf-8',
  rss: 'application/rss+xml; charset=utf-8',
  llms: 'text/plain; charset=utf-8',
} as const satisfies Record<SeoFile['kind'], string>

const body = (file: SeoFile) => {
  switch (file.kind) {
    case 'robots':
      return robotsTxt
    case 'sitemapIndex':
      return sitemapIndexXml
    case 'sitemap':
      return sitemapXml(file.locale)
    case 'rss':
      return rssXml(file.locale)
    case 'llms':
      return llmsTxt
  }
}

/**
 * `/robots.txt`, `/sitemap.xml`, `/sitemaps/{locale}.xml`, `/blog/rss.xml`, `/llms.txt`. Marketing paths: on the site
 * origin src/server.ts caches the 200 at the edge and rewrites the browser's Cache-Control, so the header here only
 * matters off the site origin. Errors (404 for a locale without the file, 500 for D1) are never cached.
 */
export const seoFileResponse = (file: SeoFile, layer: Layer.Layer<AppConfig | Db, AppError>, meta: RequestMeta) =>
  handle(
    body(file).pipe(
      Effect.map((text) =>
        new Response(text, {
          status: 200,
          headers: { 'content-type': types[file.kind], 'cache-control': 'public, max-age=0, must-revalidate', 'x-content-type-options': 'nosniff' },
        }),
      ),
    ),
    layer,
    meta,
  )
