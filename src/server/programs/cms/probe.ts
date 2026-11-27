import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { Effect } from 'effect'
import type { Locale } from '#/i18n/locales'
import * as schema from '../../db/schema'
import { Db } from '../../services/Db'
import { toUnixSeconds } from '../../time'

/** Serializable probe data (loader output). */
export interface ProbeData {
  readonly posts: ReadonlyArray<{ readonly slug: string; readonly title: string; readonly excerpt: string; readonly publishedAt: number | null }>
  readonly texts: ReadonlyArray<{ readonly key: string; readonly value: string | null }>
  readonly seo: { readonly title: string | null; readonly description: string | null; readonly live: boolean } | null
}

/**
 * The temporary CPU-gate page's data (docs/12 §7.5, `/dev/cms-probe`, removed in 6b): the shape of a real marketing
 * miss, three D1 queries in one `db.batch` (one round trip). Reads only public columns.
 */
export const cmsProbe = Effect.fn('cmsProbe')(function* (locale: Locale) {
  const db = yield* Db
  const [posts, texts, seo] = yield* db.use((d) =>
    d.batch([
      d.select({ slug: schema.posts.slug, title: schema.posts.title, excerpt: schema.posts.excerpt, publishedAt: schema.posts.publishedAt })
        .from(schema.posts)
        .where(and(eq(schema.posts.status, 'published'), isNotNull(schema.posts.publishedAt)))
        .orderBy(desc(schema.posts.publishedAt))
        .limit(12),
      d.select({ key: schema.siteTexts.key, value: schema.siteTexts.value }).from(schema.siteTexts).where(eq(schema.siteTexts.locale, locale)).limit(200),
      d.select({ title: schema.pageSeo.title, description: schema.pageSeo.description, live: schema.pageSeo.live })
        .from(schema.pageSeo)
        .where(and(eq(schema.pageSeo.pageKey, 'landing'), eq(schema.pageSeo.locale, locale))),
    ]),
  )
  return {
    posts: posts.map((p) => ({ ...p, publishedAt: p.publishedAt === null ? null : toUnixSeconds(p.publishedAt) })),
    texts,
    seo: seo[0] ?? null,
  } satisfies ProbeData
})
