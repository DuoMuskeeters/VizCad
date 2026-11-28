import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as AppConfig from '../services/AppConfig'
import type { Db } from '../services/Db'
import * as DbMemory from '../services/Db.memory'
import { blogLocales } from '#/shared/marketingRoutes'
import { sitemapLocales } from '../programs/cms/public'
import { seedAuthor, seedPost } from '../testing/blog'
import { type SeoFile, seoFileResponse } from './seoFiles'

const meta = { requestId: null }
const site = { siteUrl: new URL('https://viz-cad.com') }
/** The test's own Db and config, so rows seeded in the test are what the handler reads. */
const layer = (config: Partial<AppConfig.AppConfig['Service']> = {}) => Layer.mergeAll(DbMemory.memory, AppConfig.test({ ...site, ...config }))
const fetchFile = (file: SeoFile) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Db | AppConfig.AppConfig>()
    const response = yield* seoFileResponse(file, Layer.succeedContext(context), meta)
    return { status: response.status, type: response.headers.get('content-type'), body: yield* Effect.promise(() => response.text()) }
  })
const get = (file: SeoFile, config: Partial<AppConfig.AppConfig['Service']> = {}) => fetchFile(file).pipe(Effect.provide(layer(config)))
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

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

  it.effect('the en sitemap lists the en landing (and the empty blog) with alternates; a locale without a sitemap is 404', () =>
    Effect.gen(function* () {
      const en = yield* get({ kind: 'sitemap', locale: 'en' })
      assert.strictEqual(en.status, 200)
      assert.deepStrictEqual(locs(en.body), ['https://viz-cad.com/', 'https://viz-cad.com/blog'])
      assert.include(en.body, '<xhtml:link rel="alternate" hreflang="en" href="https://viz-cad.com/"/>')
      assert.include(en.body, '<xhtml:link rel="alternate" hreflang="x-default" href="https://viz-cad.com/"/>')
      for (const locale of ['tr', 'de', 'es', 'fr'] as const) {
        const missing = yield* get({ kind: 'sitemap', locale })
        assert.strictEqual(missing.status, 404, locale)
      }
    }))

  it.effect('the en sitemap lists the blog, public posts with lastmod and alternates, and authors with posts', () =>
    Effect.gen(function* () {
      yield* seedAuthor('ada')
      yield* seedAuthor('bob', { slug: null })
      yield* seedPost({ id: 'p1', slug: 'first', publishedAt: 1_700_000_000 })
      yield* seedPost({ id: 'p2', slug: 'second', publishedAt: 1_700_001_000, authorId: 'bob' })
      yield* seedPost({ id: 'p3', slug: 'legacy-only', translated: false })
      yield* seedPost({ id: 'p4', slug: 'gone', status: 'archived' })
      const en = yield* fetchFile({ kind: 'sitemap', locale: 'en' })
      assert.deepStrictEqual(locs(en.body), [
        'https://viz-cad.com/',
        'https://viz-cad.com/blog',
        'https://viz-cad.com/blog/second',
        'https://viz-cad.com/blog/first',
        'https://viz-cad.com/authors/ada',
      ])
      assert.include(en.body, '<lastmod>2023-11-14T22:30:05.000Z</lastmod>')
      assert.include(en.body, '<xhtml:link rel="alternate" hreflang="x-default" href="https://viz-cad.com/blog/first"/>')
      assert.notInclude(en.body, '/blog/page/')
    }).pipe(Effect.provide(layer())))

  it.effect('RSS lists the newest public posts; a locale outside blogLocales is 404', () =>
    Effect.gen(function* () {
      yield* seedAuthor('ada')
      yield* seedPost({ id: 'p1', slug: 'first' })
      yield* seedPost({ id: 'p2', slug: 'legacy-only', translated: false })
      const rss = yield* fetchFile({ kind: 'rss', locale: 'en' })
      assert.strictEqual(rss.status, 200)
      assert.strictEqual(rss.type, 'application/rss+xml; charset=utf-8')
      assert.include(rss.body, '<link>https://viz-cad.com/blog/first</link>')
      assert.notInclude(rss.body, 'legacy-only')
      assert.strictEqual((yield* fetchFile({ kind: 'rss', locale: 'tr' })).status, 404)
    }).pipe(Effect.provide(layer())))

  it.effect('llms.txt lists the landing, the blog, the newest en posts and the locale home pages', () =>
    Effect.gen(function* () {
      yield* seedAuthor('ada')
      yield* seedPost({ id: 'p1', slug: 'first' })
      const llms = yield* fetchFile({ kind: 'llms' })
      assert.strictEqual(llms.type, 'text/plain; charset=utf-8')
      assert.isTrue(llms.body.startsWith('# VizCad\n\n> '))
      assert.include(llms.body, '- [Title first](https://viz-cad.com/blog/first): Excerpt first')
      assert.include(llms.body, '- [Türkçe](https://viz-cad.com/tr)')
      // Pages that do not exist yet are not promised (03 §6).
      assert.notInclude(llms.body, '/pricing')
    }).pipe(Effect.provide(layer())))
})
