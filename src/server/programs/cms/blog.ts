/**
 * Public blog reads (docs/12 §2, §3.1). Cached SSR, no session. Every page makes at most 3 D1 queries in one
 * `db.batch` (one round trip). Reads only `post_translations` (never `posts.content`) and never renders markdown:
 * a legacy post without its `en` row does not exist here until the cutover script has run (§1.5, no read fallback).
 *
 * Visibility of a post in locale L (§2): `posts.status = 'published'`, a finished translation row in L
 * (`readTimeMin > 0`: the cutover script writes long rows in parts behind `-1`), and the `en` row too when L ≠ en.
 * Archived posts answer 410. Blog pages exist only in `blogLocales` (D9/K14); other locales are 404.
 *
 * Contract (§11): nothing here returns an email, a user id, a draft field or an R2 key outside a blog image URL.
 */
import { and, type AnyColumn, count, desc, eq, gt, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import type { Locale } from '#/i18n/locales'
import type { AuthorDetail, AuthorPage, AuthorRef, ImageRef, PostCard, PostList, PostResult, PostView, TocItem } from '#/shared/blogTypes'
import { blogLocales, paths } from '#/shared/marketingRoutes'
import * as schema from '../../db/schema'
import { AuthorUnavailable, PageUnavailable, PostGone, PostUnavailable } from '../../errors'
import { Db } from '../../services/Db'
import { toUnixSeconds } from '../../time'

export const POSTS_PER_PAGE = 12
export const RELATED_POSTS = 3
/** Newest candidates scored for "related posts" (the legacy algorithm scored all; the list is small). */
const RELATED_CANDIDATES = 60
export const RSS_ITEMS = 20

export type { AuthorDetail, AuthorPage, AuthorRef, ImageRef, PostCard, PostList, PostResult, PostView, TocItem }

const t = schema.postTranslations
const p = schema.posts
const a = schema.authorProfiles
const coverAsset = alias(schema.cmsAssets, 'cover_asset')
const ogAsset = alias(schema.cmsAssets, 'og_asset')
const avatarAsset = alias(schema.cmsAssets, 'avatar_asset')
const enRow = alias(schema.postTranslations, 'en_row')

/**
 * A joined column under its own SQL name. D1 returns batch rows as objects, so two selected columns with the same name
 * (`slug`, `r2Key`, `width`, …) would collapse into one and shift every later field. Plain (non-JSON) columns only.
 */
const named = <T>(column: AnyColumn, name: string) => sql<T>`${column}`.as(name)

/** `/api/blog/image/{encodeURIComponent(r2Key)}` (legacy shape, docs/12 §7.3). */
export const blogImagePath = (r2Key: string) => `/api/blog/image/${encodeURIComponent(r2Key)}`

/** A legacy free-text URL is shown only when it is https or site-relative (never `javascript:`, `data:`, `//host`). */
export const safeImageUrl = (raw: string | null): string | null => {
  if (raw === null) return null
  const value = raw.trim()
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value
  return /^https:\/\/[^/\\]/i.test(value) ? value : null
}

const requireBlogLocale = (locale: Locale) => blogLocales.includes(locale)

/** The visibility rule as SQL for translation rows `t` in `locale` (§2). */
const visible = (locale: Locale): SQL => {
  const own = and(eq(t.locale, locale), eq(p.status, 'published'), gt(t.readTimeMin, 0))
  if (locale === 'en') return own ?? sql`1`
  return and(own, sql`EXISTS (SELECT 1 FROM ${schema.postTranslations} AS x WHERE x."postId" = ${t.postId} AND x."locale" = 'en' AND x."readTimeMin" > 0)`) ?? sql`1`
}

const cardColumns = {
  slug: t.slug,
  title: t.title,
  excerpt: t.excerpt,
  publishedAt: t.publishedAt,
  updatedAt: t.updatedAt,
  readTimeMin: t.readTimeMin,
  coverAlt: t.coverAlt,
  category: p.category,
  tags: p.tags,
  featured: p.featured,
  coverImage: p.coverImage,
  coverKey: named<string | null>(coverAsset.r2Key, 'coverKey'),
  coverWidth: named<number | null>(coverAsset.width, 'coverWidth'),
  coverHeight: named<number | null>(coverAsset.height, 'coverHeight'),
  coverAssetAlt: named<string | null>(coverAsset.alt, 'coverAssetAlt'),
  authorName: a.name,
  authorSlug: named<string | null>(a.slug, 'authorSlug'),
  avatarUrl: a.avatarUrl,
  avatarKey: named<string | null>(avatarAsset.r2Key, 'avatarKey'),
}

type CardRow = {
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly publishedAt: Date
  readonly updatedAt: Date
  readonly readTimeMin: number
  readonly coverAlt: string | null
  readonly category: string
  readonly tags: ReadonlyArray<string> | null
  readonly featured: boolean
  readonly coverImage: string | null
  readonly coverKey: string | null
  readonly coverWidth: number | null
  readonly coverHeight: number | null
  readonly coverAssetAlt: string | null
  readonly authorName: string | null
  readonly authorSlug: string | null
  readonly avatarUrl: string | null
  readonly avatarKey: string | null
}

const cover = (row: CardRow): ImageRef | null => {
  const alt = row.coverAlt ?? row.coverAssetAlt ?? ''
  if (row.coverKey !== null) return { url: blogImagePath(row.coverKey), width: row.coverWidth, height: row.coverHeight, alt }
  const url = safeImageUrl(row.coverImage)
  return url === null ? null : { url, width: null, height: null, alt }
}

const authorRef = (row: CardRow): AuthorRef | null => {
  if (row.authorName === null) return null
  const avatarUrl = row.avatarKey !== null ? blogImagePath(row.avatarKey) : safeImageUrl(row.avatarUrl)
  return { name: row.authorName, slug: row.authorSlug, avatar: avatarUrl === null ? null : { url: avatarUrl, width: null, height: null, alt: row.authorName } }
}

const toCard = (row: CardRow): PostCard => ({
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  category: row.category,
  publishedAt: toUnixSeconds(row.publishedAt),
  updatedAt: toUnixSeconds(row.updatedAt),
  readTimeMin: row.readTimeMin,
  featured: row.featured,
  cover: cover(row),
  author: authorRef(row),
})

/** Selects cards (joined the same way everywhere, so every list shows the same card); callers add `visible(locale)`. */
const cardQuery = (d: Parameters<Parameters<Db['Service']['use']>[0]>[0]) =>
  d
    .select(cardColumns)
    .from(t)
    .innerJoin(p, eq(p.id, t.postId))
    .leftJoin(a, eq(a.userId, p.authorId))
    .leftJoin(coverAsset, eq(coverAsset.id, p.coverAssetId))
    .leftJoin(avatarAsset, eq(avatarAsset.id, a.avatarAssetId))

/** `listPublicPosts(locale, page)`: 12 cards per page, featured first, then newest (§3.1). */
export const listPublicPosts = Effect.fn('listPublicPosts')(function* (locale: Locale, page: number) {
  if (!requireBlogLocale(locale) || !Number.isInteger(page) || page < 1) return yield* new PageUnavailable()
  const db = yield* Db
  const [totals, rows] = yield* db.use((d) =>
    d.batch([
      d.select({ n: count() }).from(t).innerJoin(p, eq(p.id, t.postId)).where(visible(locale)),
      cardQuery(d)
        .where(visible(locale))
        .orderBy(desc(p.featured), desc(t.publishedAt), t.postId)
        .limit(POSTS_PER_PAGE)
        .offset((page - 1) * POSTS_PER_PAGE),
    ]),
  )
  const total = totals[0]?.n ?? 0
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE))
  if (page > pages) return yield* new PageUnavailable()
  return { page, pages, total, cards: rows.map(toCard) } satisfies PostList
})

/** Legacy related-posts score (legacy/src/lib/blog.server.ts): same category +2, each shared tag +1. */
export const relatedScore = (post: { readonly category: string; readonly tags: ReadonlyArray<string> }, other: { readonly category: string; readonly tags: ReadonlyArray<string> }) =>
  (other.category === post.category ? 2 : 0) + other.tags.filter((tag) => post.tags.includes(tag)).length

/**
 * Top `RELATED_POSTS` by score; ties keep the newest first (the candidates arrive newest first). Only posts that share
 * the category or a tag (score > 0): the purge (affectedUrls `sharesTopic`) refreshes exactly those pages when a post
 * changes, so a zero-score filler would show a stale card for a day.
 */
type Scored = { readonly category: string; readonly tags: ReadonlyArray<string> }
export const pickRelated = <C extends Scored>(post: Scored, candidates: ReadonlyArray<C>): ReadonlyArray<C> =>
  candidates
    .map((candidate, index) => ({ candidate, index, score: relatedScore(post, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .slice(0, RELATED_POSTS)
    .map((entry) => entry.candidate)

/**
 * The author's https profile links (`sameAs`). A link must also parse as a URL: the page shows its hostname, and a
 * legacy value such as `https://exa mple.com` passes the prefix check but makes `new URL` throw while rendering.
 */
export const httpsLinks = (links: Readonly<Record<string, string>> | null): ReadonlyArray<string> =>
  Object.values(links ?? {}).filter((url) => typeof url === 'string' && /^https:\/\/[^/\\]/i.test(url) && URL.canParse(url))

const authorTranslation = alias(schema.authorTranslations, 'author_tr')

/** `getPublicPost(locale, slug)` (§3.1): the post, a 301 for an old slug, 404, or 410 for an archived post (old slugs too). */
export const getPublicPost = Effect.fn('getPublicPost')(function* (locale: Locale, slug: string) {
  if (!requireBlogLocale(locale)) return yield* new PostUnavailable()
  const db = yield* Db
  const [found, redirects, candidates] = yield* db.use((d) =>
    d.batch([
      d
        .select({
          ...cardColumns,
          postId: t.postId,
          status: p.status,
          enReady: named<number | null>(enRow.readTimeMin, 'enReady'),
          contentHtml: t.contentHtml,
          toc: t.toc,
          tableOfContents: p.tableOfContents,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
          keywords: t.keywords,
          ogKey: named<string | null>(ogAsset.r2Key, 'ogKey'),
          ogWidth: named<number | null>(ogAsset.width, 'ogWidth'),
          ogHeight: named<number | null>(ogAsset.height, 'ogHeight'),
          ogAlt: named<string | null>(ogAsset.alt, 'ogAlt'),
          authorBio: named<string | null>(a.bio, 'authorBio'),
          authorRole: a.role,
          authorSocial: a.socialLinks,
          trBio: named<string | null>(authorTranslation.bio, 'trBio'),
          trJobTitle: authorTranslation.jobTitle,
          alternates: sql<string>`(SELECT json_group_array(json_array(x."locale", x."slug")) FROM ${schema.postTranslations} AS x WHERE x."postId" = ${t.postId} AND x."readTimeMin" > 0)`,
        })
        .from(t)
        .innerJoin(p, eq(p.id, t.postId))
        .leftJoin(enRow, and(eq(enRow.postId, t.postId), eq(enRow.locale, 'en')))
        .leftJoin(a, eq(a.userId, p.authorId))
        .leftJoin(authorTranslation, and(eq(authorTranslation.authorId, a.id), eq(authorTranslation.locale, locale)))
        .leftJoin(coverAsset, eq(coverAsset.id, p.coverAssetId))
        .leftJoin(avatarAsset, eq(avatarAsset.id, a.avatarAssetId))
        .leftJoin(ogAsset, eq(ogAsset.id, t.ogAssetId))
        .where(and(eq(t.locale, locale), eq(t.slug, slug), gt(t.readTimeMin, 0)))
        .limit(1),
      // The old slug's post, whatever its status: a public one is a 301, an archived one 410 (like its current slug).
      d
        .select({ slug: t.slug, status: p.status, isVisible: sql<number>`CASE WHEN ${visible(locale)} THEN 1 ELSE 0 END`.as('isVisible') })
        .from(schema.postSlugRedirects)
        .innerJoin(t, and(eq(t.postId, schema.postSlugRedirects.postId), eq(t.locale, schema.postSlugRedirects.locale)))
        .innerJoin(p, eq(p.id, t.postId))
        .where(and(eq(schema.postSlugRedirects.locale, locale), eq(schema.postSlugRedirects.slug, slug), gt(t.readTimeMin, 0)))
        .limit(1),
      cardQuery(d).where(and(visible(locale), ne(t.slug, slug))).orderBy(desc(t.publishedAt), t.postId).limit(RELATED_CANDIDATES),
    ]),
  )
  const row = found[0]
  if (row === undefined) {
    const target = redirects[0]
    if (target !== undefined && target.slug !== slug) {
      if (target.status === 'archived') return yield* new PostGone()
      if (target.isVisible === 1) return { kind: 'redirect', path: paths.post(locale, target.slug) } satisfies PostResult
    }
    return yield* new PostUnavailable()
  }
  if (row.status === 'archived') return yield* new PostGone()
  if (row.status !== 'published' || (locale !== 'en' && (row.enReady ?? 0) <= 0)) return yield* new PostUnavailable()

  const card = toCard(row)
  const tags = row.tags ?? []
  const related = pickRelated({ category: row.category, tags }, candidates.map((c) => ({ ...c, tags: c.tags ?? [] }))).map(toCard)
  const alternates: Partial<Record<Locale, string>> = {}
  for (const [l, s] of JSON.parse(row.alternates) as ReadonlyArray<[Locale, string]>) if (blogLocales.includes(l)) alternates[l] = paths.post(l, s)
  const ogImage = row.ogKey !== null ? { url: blogImagePath(row.ogKey), width: row.ogWidth, height: row.ogHeight, alt: row.ogAlt ?? card.title } : card.cover
  const author = card.author
  const view: PostView = {
    ...card,
    contentHtml: row.contentHtml,
    toc: row.toc,
    showToc: row.tableOfContents && row.toc.length > 1,
    tags,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    keywords: row.keywords ?? [],
    ogImage,
    authorDetail:
      author === null
        ? null
        : { ...author, bio: row.trBio ?? row.authorBio, jobTitle: row.trJobTitle ?? row.authorRole, sameAs: httpsLinks(row.authorSocial) },
    related,
    alternates: { ...alternates, en: alternates.en ?? paths.post('en', slug) },
  }
  return { kind: 'post', post: view } satisfies PostResult
})

/** `getPublicAuthor(locale, slug)` (§3.1): an author with a slug and at least one public post in this locale. */
export const getPublicAuthor = Effect.fn('getPublicAuthor')(function* (locale: Locale, slug: string) {
  if (!requireBlogLocale(locale)) return yield* new AuthorUnavailable()
  const db = yield* Db
  const [authors, rows] = yield* db.use((d) =>
    d.batch([
      d
        .select({
          name: a.name,
          slug: a.slug,
          bio: a.bio,
          role: a.role,
          socialLinks: a.socialLinks,
          avatarUrl: a.avatarUrl,
          avatarKey: named<string | null>(avatarAsset.r2Key, 'avatarKey'),
          trBio: named<string | null>(authorTranslation.bio, 'trBio'),
          trJobTitle: authorTranslation.jobTitle,
        })
        .from(a)
        .leftJoin(avatarAsset, eq(avatarAsset.id, a.avatarAssetId))
        .leftJoin(authorTranslation, and(eq(authorTranslation.authorId, a.id), eq(authorTranslation.locale, locale)))
        .where(eq(a.slug, slug))
        .limit(1),
      cardQuery(d).where(and(visible(locale), eq(a.slug, slug))).orderBy(desc(t.publishedAt), t.postId).limit(100),
    ]),
  )
  const author = authors[0]
  if (author === undefined || author.slug === null || rows.length === 0) return yield* new AuthorUnavailable()
  const avatarUrl = author.avatarKey !== null ? blogImagePath(author.avatarKey) : safeImageUrl(author.avatarUrl)
  return {
    author: {
      name: author.name,
      slug: author.slug,
      avatar: avatarUrl === null ? null : { url: avatarUrl, width: null, height: null, alt: author.name },
      bio: author.trBio ?? author.bio,
      jobTitle: author.trJobTitle ?? author.role,
      sameAs: httpsLinks(author.socialLinks),
    },
    posts: rows.map(toCard),
  } satisfies AuthorPage
})

/** The newest public posts in `locale` (RSS, llms.txt), newest first. */
export const latestPosts = Effect.fn('latestPosts')(function* (locale: Locale, limit: number) {
  if (!requireBlogLocale(locale)) return [] as ReadonlyArray<PostCard>
  const db = yield* Db
  const rows = yield* db.use((d) => cardQuery(d).where(visible(locale)).orderBy(desc(t.publishedAt), t.postId).limit(limit))
  return rows.map(toCard)
})

export interface SitemapPost {
  readonly postId: string
  readonly locale: Locale
  readonly slug: string
  readonly updatedAt: number
  readonly authorSlug: string | null
}

/** Every public post translation in `locales`, for sitemaps (one query; alternates come from the same rows). */
export const sitemapPosts = Effect.fn('sitemapPosts')(function* (locales: ReadonlyArray<Locale>) {
  const open = locales.filter(requireBlogLocale)
  if (open.length === 0) return [] as ReadonlyArray<SitemapPost>
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d
      .select({ postId: t.postId, locale: t.locale, slug: t.slug, updatedAt: t.updatedAt, authorSlug: named<string | null>(a.slug, 'authorSlug') })
      .from(t)
      .innerJoin(p, eq(p.id, t.postId))
      .leftJoin(a, eq(a.userId, p.authorId))
      .where(
        and(
          inArray(t.locale, [...open]),
          eq(p.status, 'published'),
          gt(t.readTimeMin, 0),
          sql`EXISTS (SELECT 1 FROM ${schema.postTranslations} AS x WHERE x."postId" = ${t.postId} AND x."locale" = 'en' AND x."readTimeMin" > 0)`,
        ),
      )
      .orderBy(desc(t.publishedAt), t.postId),
  )
  return rows.map((r): SitemapPost => ({ ...r, updatedAt: toUnixSeconds(r.updatedAt) }))
})
