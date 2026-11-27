import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as schema from '../../db/schema'
import { Db } from '../../services/Db'
import { programLayer, seedUser } from '../../testing/fixtures'
import { cmsProbe } from './probe'

const at = (s: number) => new Date(s * 1000)

describe('cmsProbe', () => {
  it.effect('returns published posts newest first, the locale texts and the landing SEO, in one batch', () =>
    Effect.gen(function* () {
      yield* seedUser('ada')
      const db = yield* Db
      yield* db.use((d) =>
        d.batch([
          d.insert(schema.posts).values([
            { id: 'p1', slug: 'old', title: 'Old', excerpt: 'e', content: '# x', status: 'published', category: 'g', readTime: 1, authorId: 'ada', publishedAt: at(100), createdAt: at(1), updatedAt: at(1) },
            { id: 'p2', slug: 'new', title: 'New', excerpt: 'e', content: '# x', status: 'published', category: 'g', readTime: 1, authorId: 'ada', publishedAt: at(200), createdAt: at(1), updatedAt: at(1) },
            { id: 'p3', slug: 'draft', title: 'Draft', excerpt: 'e', content: '# x', status: 'draft', category: 'g', readTime: 1, authorId: 'ada', createdAt: at(1), updatedAt: at(1) },
          ]),
          d.insert(schema.siteTexts).values([
            { key: 'landing.title', locale: 'tr', value: 'Merhaba', updatedAt: at(1) },
            { key: 'landing.title', locale: 'en', value: 'Hello', updatedAt: at(1) },
          ]),
          d.insert(schema.pageSeo).values({ pageKey: 'landing', locale: 'tr', title: 'VizCad', description: 'CAD', live: true, updatedAt: at(1) }),
        ]),
      )
      const data = yield* cmsProbe('tr')
      assert.deepStrictEqual(data.posts.map((p) => [p.slug, p.publishedAt]), [['new', 200], ['old', 100]])
      assert.deepStrictEqual(data.texts, [{ key: 'landing.title', value: 'Merhaba' }])
      assert.deepStrictEqual(data.seo, { title: 'VizCad', description: 'CAD', live: true })
      assert.isNull((yield* cmsProbe('de')).seo)
    }).pipe(Effect.provide(programLayer())),
  )
})
