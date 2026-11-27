import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as AppConfig from '../services/AppConfig'
import { blogLocales } from '#/shared/marketingRoutes'
import { sitemapLocales } from '../programs/cms/public'
import { type SeoFile, seoFileResponse } from './seoFiles'

const meta = { requestId: null }
const get = (file: SeoFile, config: Partial<AppConfig.AppConfig['Service']> = {}) =>
  Effect.gen(function* () {
    const response = yield* seoFileResponse(file, AppConfig.test({ siteUrl: new URL('https://viz-cad.com'), ...config }), meta)
    return { status: response.status, type: response.headers.get('content-type'), body: yield* Effect.promise(() => response.text()) }
  })

describe('robots.txt and sitemaps', () => {
  it.effect('robots.txt follows appEnv: production opens marketing, staging and development close everything', () =>
    Effect.gen(function* () {
      const prod = yield* get({ kind: 'robots' }, { appEnv: 'production' })
      assert.strictEqual(prod.status, 200)
      assert.strictEqual(prod.type, 'text/plain; charset=utf-8')
      assert.include(prod.body, 'Allow: /api/blog/image/')
      assert.include(prod.body, 'Sitemap: https://viz-cad.com/sitemap.xml')
      for (const appEnv of ['staging', 'development'] as const) {
        const closed = yield* get({ kind: 'robots' }, { appEnv })
        assert.include(closed.body, 'User-agent: *\nDisallow: /\n')
        assert.notInclude(closed.body, 'Sitemap:')
      }
    }))

  it('sitemap locales come from blogLocales (D9/K14): today only en', () => {
    assert.deepStrictEqual([...sitemapLocales], [...blogLocales])
    assert.deepStrictEqual([...sitemapLocales], ['en'])
  })

  it.effect('/sitemap.xml is the index and lists one sitemap per sitemap locale', () =>
    Effect.gen(function* () {
      const index = yield* get({ kind: 'sitemapIndex' })
      assert.strictEqual(index.status, 200)
      assert.strictEqual(index.type, 'application/xml; charset=utf-8')
      assert.deepStrictEqual([...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://viz-cad.com/sitemaps/en.xml'])
    }))

  it.effect('the en sitemap lists the en landing with its alternates; a locale without a sitemap is 404', () =>
    Effect.gen(function* () {
      const en = yield* get({ kind: 'sitemap', locale: 'en' })
      assert.strictEqual(en.status, 200)
      assert.deepStrictEqual([...en.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://viz-cad.com/'])
      assert.include(en.body, '<xhtml:link rel="alternate" hreflang="en" href="https://viz-cad.com/"/>')
      assert.include(en.body, '<xhtml:link rel="alternate" hreflang="x-default" href="https://viz-cad.com/"/>')
      for (const locale of ['tr', 'de', 'es', 'fr'] as const) {
        const missing = yield* get({ kind: 'sitemap', locale })
        assert.strictEqual(missing.status, 404, locale)
      }
    }))
})
