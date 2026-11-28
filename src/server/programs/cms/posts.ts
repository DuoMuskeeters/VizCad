/**
 * Admin post programs behind `/api/cms` (docs/12 §3.2): list, read, create, drafts, post fields, preview, publish,
 * unpublish, archive, restore and delete. Callers are platform admins (http/cms.ts checks `canManageContent` first).
 *
 * - **Drafts** (`post_drafts`) are working copies; editing never changes the live page. Each translation has its own
 *   optimistic lock: the draft's `revision`, or, with no draft, the live row's `updatedAt` (seconds), or 0. A stale
 *   copy gets `ContentConflict`.
 * - **Publishing** renders the markdown once (server/cms/markdown.ts, raw HTML off, render markers neutralised) and
 *   writes one `db.batch`: the translation, the draft's removal, the slug redirect, for `en` the legacy `posts` mirror
 *   (so the old Worker still serves the blog after a rollback, §1.5 step 3), and the purge queue rows from
 *   `affectedUrls` (§7.4). The purge is tried right after with the publish budget; its failure never undoes the
 *   content: the rows stay queued for the admin drain and the cron.
 * - **D9/K14**: only `blogLocales` can be published; other locales save drafts (`PublishBlocked` `locale-closed`).
 *   **K3**: no locale goes live before `en`.
 * - Without purge config (rule 2) a change that alters public pages is `CacheError` before anything is written.
 */
import { and, desc, eq, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import type { PostView } from '#/shared/blogTypes'
import {
  type AdminPost,
  type AdminPostList,
  type AdminPostRow,
  type Coverage,
  type DraftSaved,
  type LocaleState,
  POST_LIMITS,
  type PreviewResult,
  type PublishResult,
  type TranslationFields,
} from '#/shared/cmsTypes'
import { blogLocales, LOCALES, type Locale, paths } from '#/shared/marketingRoutes'
import { affectedUrls, type ContentChange, type RelatedCandidate } from '../../cms/affectedUrls'
import { blogImageKey, renderMarkdown, type KnownAsset, type Rendered } from '../../cms/markdown'
import { isValidSlug, slugify } from '../../cms/slug'
import * as schema from '../../db/schema'
import { AssetUnavailable, AuthorUnavailable, ContentConflict, PostUnavailable, PublishBlocked, SlugConflict, TextTooLong, ValidationError } from '../../errors'
import { AppConfig } from '../../services/AppConfig'
import { Db } from '../../services/Db'
import { fromUnixSeconds, toUnixSeconds } from '../../time'
import { drainCachePurges, enqueuePurges, PUBLISH_MAX_CALLS } from '../cachePurges'
import { guard, newId, nowSeconds, runBatch } from '../shared'
import { blogImagePath, httpsLinks, named, neutraliseRenderMarkers, POSTS_PER_PAGE, safeImageUrl, visible } from './blog'
import { requireConfigured } from './cache'

export interface Actor {
  readonly userId: string
}

const p = schema.posts
const t = schema.postTranslations
const dr = schema.postDrafts
const a = schema.authorProfiles
const coverAsset = alias(schema.cmsAssets, 'cover_asset')

/** A live translation row: the cutover script writes long rows in parts behind `readTimeMin = -1` (never public). */
const isLive = (row: { readonly readTimeMin: number }) => row.readTimeMin > 0

const bytes = (text: string) => new TextEncoder().encode(text).length

// ---------------------------------------------------------------------------------------------------------------------
// Field checks

export interface DraftInput {
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly contentMd: string
  readonly metaTitle: string | null
  readonly metaDescription: string | null
  readonly keywords: ReadonlyArray<string>
  readonly coverAlt: string | null
  readonly ogAssetId: string | null
}

const blankToNull = (value: string | null) => (value === null || value.trim() === '' ? null : value.trim())

/** Trimmed, deduplicated, empty entries dropped (keywords and tags). */
const cleanList = (values: ReadonlyArray<string>) => [...new Set(values.map((v) => v.trim()).filter((v) => v !== ''))]

/** Normalises draft fields and enforces the limits (`TextTooLong` names the field and its limit). */
export const checkDraft = Effect.fnUntraced(function* (input: DraftInput) {
  const fields: DraftInput = {
    slug: input.slug.trim(),
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    contentMd: input.contentMd,
    metaTitle: blankToNull(input.metaTitle),
    metaDescription: blankToNull(input.metaDescription),
    keywords: cleanList(input.keywords),
    coverAlt: blankToNull(input.coverAlt),
    ogAssetId: input.ogAssetId,
  }
  const over: Array<[string, number]> = []
  if (fields.title.length > POST_LIMITS.title) over.push(['title', POST_LIMITS.title])
  if (fields.excerpt.length > POST_LIMITS.excerpt) over.push(['excerpt', POST_LIMITS.excerpt])
  if ((fields.metaTitle?.length ?? 0) > POST_LIMITS.metaTitle) over.push(['metaTitle', POST_LIMITS.metaTitle])
  if ((fields.metaDescription?.length ?? 0) > POST_LIMITS.metaDescription) over.push(['metaDescription', POST_LIMITS.metaDescription])
  if ((fields.coverAlt?.length ?? 0) > POST_LIMITS.coverAlt) over.push(['coverAlt', POST_LIMITS.coverAlt])
  if (fields.keywords.length > POST_LIMITS.keywords) over.push(['keywords', POST_LIMITS.keywords])
  if (fields.keywords.some((k) => k.length > POST_LIMITS.keyword)) over.push(['keywords', POST_LIMITS.keyword])
  if (bytes(fields.contentMd) > POST_LIMITS.contentMd) over.push(['contentMd', POST_LIMITS.contentMd])
  const first = over[0]
  if (first !== undefined) return yield* new TextTooLong({ field: first[0], max: first[1] })
  return fields
})

// ---------------------------------------------------------------------------------------------------------------------
// Reads

type PostRow = typeof schema.posts.$inferSelect
type TranslationRow = typeof schema.postTranslations.$inferSelect
type DraftRow = typeof schema.postDrafts.$inferSelect

interface PostState {
  readonly post: PostRow
  readonly authorSlug: string | null
  readonly coverKey: string | null
  readonly coverWidth: number | null
  readonly coverHeight: number | null
  readonly translations: ReadonlyMap<Locale, TranslationRow>
  readonly drafts: ReadonlyMap<Locale, DraftRow>
}

/** The post with its translations and drafts, in one round trip. Missing: `PostUnavailable`. */
const loadPost = Effect.fnUntraced(function* (postId: string) {
  const db = yield* Db
  const [posts, translations, drafts] = yield* db.use((d) =>
    d.batch([
      d
        .select({
          post: p,
          authorSlug: named<string | null>(a.slug, 'authorSlug'),
          coverKey: named<string | null>(coverAsset.r2Key, 'coverKey'),
          coverWidth: named<number | null>(coverAsset.width, 'coverWidth'),
          coverHeight: named<number | null>(coverAsset.height, 'coverHeight'),
        })
        .from(p)
        .leftJoin(a, eq(a.userId, p.authorId))
        .leftJoin(coverAsset, eq(coverAsset.id, p.coverAssetId))
        .where(eq(p.id, postId))
        .limit(1),
      d.select().from(t).where(eq(t.postId, postId)),
      d.select().from(dr).where(eq(dr.postId, postId)),
    ]),
  )
  const row = posts[0]
  if (row === undefined) return yield* new PostUnavailable()
  return {
    post: row.post,
    authorSlug: row.authorSlug,
    coverKey: row.coverKey,
    coverWidth: row.coverWidth,
    coverHeight: row.coverHeight,
    translations: new Map(translations.map((r) => [r.locale, r])),
    drafts: new Map(drafts.map((r) => [r.locale, r])),
  } satisfies PostState
})

/** The translation's lock value (module doc): draft revision, else the live row's `updatedAt` seconds, else 0. */
const revisionOf = (state: PostState, locale: Locale) => {
  const draft = state.drafts.get(locale)
  if (draft !== undefined) return draft.revision
  const live = state.translations.get(locale)
  return live === undefined ? 0 : toUnixSeconds(live.updatedAt)
}

/** The same value as SQL, for the batch guard (the read above may be stale by the time the batch runs). */
const revisionSql = (postId: string, locale: Locale): SQL =>
  sql`COALESCE((SELECT x."revision" FROM ${dr} AS x WHERE x."postId" = ${postId} AND x."locale" = ${locale}), (SELECT y."updatedAt" FROM ${t} AS y WHERE y."postId" = ${postId} AND y."locale" = ${locale}), 0)`

const postRevisionSql = (postId: string): SQL => sql`COALESCE((SELECT x."revision" FROM ${p} AS x WHERE x."id" = ${postId}), 0)`

/** Locale → slug of every translation visible to the public (§2) in this state. */
const visibleSlugs = (status: string, translations: ReadonlyMap<Locale, { readonly slug: string; readonly readTimeMin: number }>) => {
  const out: Partial<Record<Locale, string>> = {}
  const en = translations.get('en')
  if (status !== 'published' || en === undefined || !isLive(en)) return out
  for (const [locale, row] of translations) if (isLive(row)) out[locale] = row.slug
  return out
}

const fieldsOf = (row: TranslationRow | DraftRow): TranslationFields => ({
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  contentMd: row.contentMd,
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
  keywords: row.keywords ?? [],
  coverAlt: row.coverAlt,
  ogAssetId: row.ogAssetId,
})

const coverOf = (state: PostState): AdminPost['cover'] => {
  if (state.coverKey !== null) return { assetId: state.post.coverAssetId, url: blogImagePath(state.coverKey), width: state.coverWidth, height: state.coverHeight }
  const url = safeImageUrl(state.post.coverImage)
  return url === null ? null : { assetId: null, url, width: null, height: null }
}

/** `getPostAdmin(postId)`: the post, every locale's live and draft text with its lock, and the authors to pick from. */
export const getPostAdmin = Effect.fn('getPostAdmin')(function* (postId: string) {
  const state = yield* loadPost(postId)
  const db = yield* Db
  const ogIds = [...new Set([...state.translations.values(), ...state.drafts.values()].flatMap((r) => (r.ogAssetId === null ? [] : [r.ogAssetId])))]
  const [authors, ogAssets] = yield* db.use((d) =>
    d.batch([
      d.select({ userId: a.userId, name: a.name }).from(a).orderBy(a.name),
      d.select({ id: schema.cmsAssets.id, r2Key: schema.cmsAssets.r2Key }).from(schema.cmsAssets).where(inArray(schema.cmsAssets.id, ogIds.length === 0 ? [''] : ogIds)),
    ]),
  )
  const locales = {} as Record<Locale, LocaleState>
  for (const locale of LOCALES) {
    const live = state.translations.get(locale)
    const draft = state.drafts.get(locale)
    locales[locale] = {
      live: live === undefined || !isLive(live) ? null : { ...fieldsOf(live), publishedAt: toUnixSeconds(live.publishedAt), updatedAt: toUnixSeconds(live.updatedAt) },
      draft: draft === undefined ? null : { ...fieldsOf(draft), updatedAt: toUnixSeconds(draft.updatedAt) },
      revision: revisionOf(state, locale),
    }
  }
  return {
    id: state.post.id,
    status: state.post.status,
    category: state.post.category,
    tags: state.post.tags ?? [],
    authorId: state.post.authorId,
    cover: coverOf(state),
    featured: state.post.featured,
    tableOfContents: state.post.tableOfContents,
    revision: state.post.revision ?? 0,
    views: state.post.views,
    createdAt: toUnixSeconds(state.post.createdAt),
    updatedAt: toUnixSeconds(state.post.updatedAt),
    locales,
    authors,
    publishable: blogLocales,
    images: Object.fromEntries(ogAssets.map((r) => [r.id, blogImagePath(r.r2Key)])),
  } satisfies AdminPost
})

export const ADMIN_PAGE_SIZE = 50

/** `cursor` is `{updatedAt seconds}:{id}` of the last row of the previous page (newest first). */
const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) return null
  const match = /^(\d{1,12}):(.{1,64})$/.exec(cursor)
  return match === null ? undefined : { updatedAt: Number(match[1]), id: match[2] ?? '' }
}

/** `listPostsAdmin`: newest change first, 50 per page; filters by status, a missing locale and a title search. */
export const listPostsAdmin = Effect.fn('listPostsAdmin')(function* (input: {
  readonly status?: 'draft' | 'published' | 'archived' | undefined
  readonly missingLocale?: Locale | undefined
  readonly q?: string | undefined
  readonly cursor?: string | undefined
}) {
  const cursor = parseCursor(input.cursor)
  if (cursor === undefined) return yield* new ValidationError({ message: 'invalid cursor' })
  const db = yield* Db
  const enTitle = sql<string>`COALESCE((SELECT x."title" FROM ${dr} AS x WHERE x."postId" = ${p.id} AND x."locale" = 'en'), (SELECT y."title" FROM ${t} AS y WHERE y."postId" = ${p.id} AND y."locale" = 'en'), ${p.title})`
  const conditions: Array<SQL | undefined> = []
  if (input.status !== undefined) conditions.push(eq(p.status, input.status))
  if (input.missingLocale !== undefined) conditions.push(sql`NOT EXISTS (SELECT 1 FROM ${t} AS m WHERE m."postId" = ${p.id} AND m."locale" = ${input.missingLocale} AND m."readTimeMin" > 0)`)
  const q = input.q?.trim()
  if (q) conditions.push(sql`instr(lower(${enTitle}), lower(${q})) > 0`)
  if (cursor !== null) {
    const at = fromUnixSeconds(cursor.updatedAt)
    conditions.push(or(lt(p.updatedAt, at), and(eq(p.updatedAt, at), lt(p.id, cursor.id))))
  }
  const rows = yield* db.use((d) =>
    d
      .select({
        id: p.id,
        title: enTitle.as('enTitle'),
        status: p.status,
        views: p.views,
        updatedAt: p.updatedAt,
        authorName: a.name,
        live: sql<string>`(SELECT json_group_array(x."locale") FROM ${t} AS x WHERE x."postId" = ${p.id} AND x."readTimeMin" > 0)`.as('liveLocales'),
        drafts: sql<string>`(SELECT json_group_array(x."locale") FROM ${dr} AS x WHERE x."postId" = ${p.id})`.as('draftLocales'),
        lastPublishedAt: sql<number | null>`(SELECT max(x."updatedAt") FROM ${t} AS x WHERE x."postId" = ${p.id} AND x."readTimeMin" > 0)`.as('lastPublishedAt'),
      })
      .from(p)
      .leftJoin(a, eq(a.userId, p.authorId))
      .where(and(...conditions))
      .orderBy(desc(p.updatedAt), desc(p.id))
      .limit(ADMIN_PAGE_SIZE + 1),
  )
  const page = rows.slice(0, ADMIN_PAGE_SIZE)
  const last = page.at(-1)
  return {
    rows: page.map((r): AdminPostRow => {
      const live = new Set(JSON.parse(r.live) as Array<Locale>)
      const drafts = new Set(JSON.parse(r.drafts) as Array<Locale>)
      const coverage = {} as Record<Locale, Coverage>
      for (const l of LOCALES) coverage[l] = live.has(l) ? (drafts.has(l) ? 'live-draft' : 'live') : drafts.has(l) ? 'draft' : 'none'
      return { id: r.id, title: r.title, status: r.status, coverage, authorName: r.authorName, lastPublishedAt: r.lastPublishedAt, views: r.views, updatedAt: toUnixSeconds(r.updatedAt) }
    }),
    next: rows.length > ADMIN_PAGE_SIZE && last !== undefined ? `${toUnixSeconds(last.updatedAt)}:${last.id}` : null,
  } satisfies AdminPostList
})

// ---------------------------------------------------------------------------------------------------------------------
// Purge context

/** Visible posts per blog locale (for the blog list page count) and the other public posts (related-post pages). */
const purgeContext = Effect.fnUntraced(function* (postId: string) {
  const db = yield* Db
  const [others, ...counts] = yield* db.use((d) =>
    d.batch([
      d
        .select({ postId: t.postId, locale: t.locale, slug: t.slug, category: p.category, tags: p.tags })
        .from(t)
        .innerJoin(p, eq(p.id, t.postId))
        .where(and(eq(p.status, 'published'), sql`${t.readTimeMin} > 0`, ne(t.postId, postId), inArray(t.locale, [...blogLocales])))
        .limit(2000),
      ...blogLocales.map((locale) => d.select({ n: sql<number>`count(*)` }).from(t).innerJoin(p, eq(p.id, t.postId)).where(visible(locale))),
    ] as const),
  )
  const byPost = new Map<string, { slugs: Partial<Record<Locale, string>>; category: string; tags: ReadonlyArray<string> }>()
  for (const row of others) {
    const entry = byPost.get(row.postId) ?? { slugs: {}, category: row.category, tags: row.tags ?? [] }
    entry.slugs[row.locale] = row.slug
    byPost.set(row.postId, entry)
  }
  const visibleCount = new Map<Locale, number>(blogLocales.map((locale, i) => [locale, (counts[i] as ReadonlyArray<{ n: number }> | undefined)?.[0]?.n ?? 0]))
  return { candidates: [...byPost.values()] as ReadonlyArray<RelatedCandidate>, visibleCount }
})

const pagesOf = (n: number) => Math.max(1, Math.ceil(n / POSTS_PER_PAGE))

/** Blog list page counts per blog locale before and after a change of this post's visible slugs. */
const blogPages = (visibleCount: ReadonlyMap<Locale, number>, before: Partial<Record<Locale, string>>, after: Partial<Record<Locale, string>>) => {
  const out: Partial<Record<Locale, { before: number; after: number }>> = {}
  for (const [locale, n] of visibleCount) {
    const delta = (after[locale] === undefined ? 0 : 1) - (before[locale] === undefined ? 0 : 1)
    out[locale] = { before: pagesOf(n), after: pagesOf(n + delta) }
  }
  return out
}

const union = (x: Partial<Record<Locale, string>>, y: Partial<Record<Locale, string>>) => ({ ...x, ...y })

const publicUrls = (slugs: Partial<Record<Locale, string>>) =>
  LOCALES.flatMap((locale) => {
    const slug = slugs[locale]
    return slug === undefined || !blogLocales.includes(locale) ? [] : [paths.post(locale, slug)]
  })

/**
 * Queue statements for a change and the immediate purge after the batch. A drain failure (D1 or the API) after the
 * content is written is reported as `purge: null`: the content stays live and the queue finishes the purge.
 */
const purgeAfter = (count: number) =>
  count === 0
    ? Effect.succeed(null)
    : drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS }).pipe(
        Effect.catch((error) => Effect.logWarning('cms purge after publish failed').pipe(Effect.annotateLogs({ error: error._tag }), Effect.as(null))),
      )

// ---------------------------------------------------------------------------------------------------------------------
// Rendering

const IMAGE_URL = /\/api\/blog\/image\/[^\s)"'<>\]]+/g

/** `cms_assets` rows of the blog images the markdown names (width, height and variants for CLS and srcset). */
const assetsFor = Effect.fnUntraced(function* (markdown: string) {
  const keys = [...new Set([...markdown.matchAll(IMAGE_URL)].map((m) => blogImageKey(m[0])).filter((k): k is string => k !== null))].slice(0, 90)
  if (keys.length === 0) return new Map<string, KnownAsset>()
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d.select({ r2Key: schema.cmsAssets.r2Key, width: schema.cmsAssets.width, height: schema.cmsAssets.height, variants: schema.cmsAssets.variants }).from(schema.cmsAssets).where(inArray(schema.cmsAssets.r2Key, keys)),
  )
  return new Map(rows.map((r): [string, KnownAsset] => [r.r2Key, { width: r.width, height: r.height, variants: r.variants }]))
})

/**
 * Markdown → stored HTML (docs/12 §4.3): raw HTML off, links and images filtered, then React's failed-render markers
 * turned into entities (blog.ts), so the stored HTML is already what the public page prints.
 */
export const renderForStorage = Effect.fnUntraced(function* (markdown: string, locale: Locale) {
  const assets = yield* assetsFor(markdown)
  // Thousands of nested markers overflow the parser's own recursion (mdast-util-find-and-replace) before the depth cap
  // can see the tree: that throw is the same refusal, never a 500.
  const rendered = yield* Effect.try({ try: () => renderMarkdown(markdown, { locale, assets }), catch: () => new PublishBlocked({ reason: 'render-limit', fields: ['depth'] }) })
  if (rendered.exceeded !== undefined) return yield* new PublishBlocked({ reason: 'render-limit', fields: [rendered.exceeded] })
  return { ...rendered, html: neutraliseRenderMarkers(rendered.html) } satisfies Rendered
})

// ---------------------------------------------------------------------------------------------------------------------
// Writes

/** `createPost(title)`: a draft post with an `en` draft. The legacy `posts` row is filled so a rollback still reads it. */
export const createPost = Effect.fn('createPost')(function* (input: { readonly title: string }, actor: Actor) {
  const title = input.title.trim()
  if (title.length > POST_LIMITS.title) return yield* new TextTooLong({ field: 'title', max: POST_LIMITS.title })
  if (title === '') return yield* new ValidationError({ message: 'title required' })
  const id = yield* newId
  const now = fromUnixSeconds(yield* nowSeconds)
  yield* runBatch((d) => [
    d.insert(p).values({
      id,
      // A placeholder: the legacy column is unique, and the real slug is only reserved when `en` is published.
      slug: `draft-${id}`,
      title,
      excerpt: '',
      content: '',
      category: 'general',
      tags: [],
      readTime: 1,
      status: 'draft',
      authorId: actor.userId,
      revision: 0,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    }),
    d.insert(dr).values({ postId: id, locale: 'en', slug: slugify(title) || `post-${id.slice(0, 8)}`, title, excerpt: '', contentMd: '', revision: 1, updatedAt: now, updatedByUserId: actor.userId }),
  ])
  return { postId: id, revision: 1 }
})

/** Whether `slug` is taken in `locale` by another post (its translation, or for `en` its legacy `posts.slug`). */
const slugTaken = Effect.fnUntraced(function* (postId: string, locale: Locale, slug: string) {
  const db = yield* Db
  const [translations, legacy] = yield* db.use((d) =>
    d.batch([
      d.select({ id: t.postId }).from(t).where(and(eq(t.locale, locale), eq(t.slug, slug), ne(t.postId, postId))).limit(1),
      d.select({ id: p.id }).from(p).where(locale === 'en' ? and(eq(p.slug, slug), ne(p.id, postId)) : sql`0`).limit(1),
    ]),
  )
  return translations.length > 0 || legacy.length > 0
})

/** A slug the translation may go live with: valid (§4.2), or its current live slug (a legacy slug is kept until changed). */
const slugAllowed = (state: PostState, locale: Locale, slug: string) => isValidSlug(slug) || (slug !== '' && state.translations.get(locale)?.slug === slug)

/** `saveDraft(postId, locale, fields, revision)`: writes the working copy; any locale, the live page is untouched. */
export const saveDraft = Effect.fn('saveDraft')(function* (input: { readonly postId: string; readonly locale: Locale; readonly fields: DraftInput; readonly revision: number }, actor: Actor) {
  const fields = yield* checkDraft(input.fields)
  const state = yield* loadPost(input.postId)
  if (revisionOf(state, input.locale) !== input.revision) return yield* new ContentConflict()
  if (fields.ogAssetId !== null) yield* requireAsset(fields.ogAssetId)
  const revision = input.revision + 1
  const nowS = yield* nowSeconds
  const now = fromUnixSeconds(nowS)
  const values = {
    slug: fields.slug,
    title: fields.title,
    excerpt: fields.excerpt,
    contentMd: fields.contentMd,
    metaTitle: fields.metaTitle,
    metaDescription: fields.metaDescription,
    keywords: [...fields.keywords],
    coverAlt: fields.coverAlt,
    ogAssetId: fields.ogAssetId,
    revision,
    updatedAt: now,
    updatedByUserId: actor.userId,
  }
  yield* runBatch((d) => [
    guard(d, sql`${revisionSql(input.postId, input.locale)} = ${input.revision}`),
    d.insert(dr).values({ postId: input.postId, locale: input.locale, ...values }).onConflictDoUpdate({ target: [dr.postId, dr.locale], set: values }),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new ContentConflict())))
  const slugInvalid = !slugAllowed(state, input.locale, fields.slug)
  return {
    revision,
    updatedAt: nowS,
    slugInvalid,
    slugTaken: slugInvalid ? false : yield* slugTaken(input.postId, input.locale, fields.slug),
  } satisfies DraftSaved
})

const requireAsset = Effect.fnUntraced(function* (assetId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) => d.select({ r2Key: schema.cmsAssets.r2Key }).from(schema.cmsAssets).where(eq(schema.cmsAssets.id, assetId)).limit(1))
  const row = rows[0]
  if (row === undefined) return yield* new AssetUnavailable()
  return row
})

export interface MetaInput {
  readonly postId: string
  readonly category: string
  readonly tags: ReadonlyArray<string>
  readonly authorId: string
  readonly coverAssetId: string | null
  /**
   * Also clear a legacy URL-only cover (`posts.coverImage` without an asset). Without it, `coverAssetId: null` on a post
   * that never had an asset keeps the legacy cover, so saving other fields never drops it.
   */
  readonly removeCover?: boolean | undefined
  readonly featured: boolean
  readonly tableOfContents: boolean
  readonly revision: number
}

/**
 * `updatePostMeta`: post-level fields (category, tags, author, cover, featured, contents list), live at once (they are
 * not per translation). The legacy `coverImage` mirrors the cover as a `/api/blog/image/...` URL (§1.5 step 3). A
 * public post's pages are purged (old and new category/tags, old and new author).
 */
export const updatePostMeta = Effect.fn('updatePostMeta')(function* (input: MetaInput, actor: Actor) {
  const category = input.category.trim()
  const tags = cleanList(input.tags)
  if (category === '') return yield* new ValidationError({ message: 'category required' })
  if (category.length > POST_LIMITS.category) return yield* new TextTooLong({ field: 'category', max: POST_LIMITS.category })
  if (tags.length > POST_LIMITS.tags) return yield* new TextTooLong({ field: 'tags', max: POST_LIMITS.tags })
  if (tags.some((tag) => tag.length > POST_LIMITS.tag)) return yield* new TextTooLong({ field: 'tags', max: POST_LIMITS.tag })
  const state = yield* loadPost(input.postId)
  if ((state.post.revision ?? 0) !== input.revision) return yield* new ContentConflict()
  const db = yield* Db
  const authors = yield* db.use((d) => d.select({ slug: a.slug }).from(a).where(eq(a.userId, input.authorId)).limit(1))
  const author = authors[0]
  if (author === undefined) return yield* new AuthorUnavailable()
  const cover = input.coverAssetId === null ? null : yield* requireAsset(input.coverAssetId)
  const keepLegacyCover = input.coverAssetId === null && state.post.coverAssetId === null && input.removeCover !== true
  const slugs = visibleSlugs(state.post.status, state.translations)
  const isPublic = Object.keys(slugs).length > 0
  if (isPublic) yield* requireConfigured
  const { siteUrl } = yield* AppConfig
  const context = yield* purgeContext(input.postId)
  const change: ContentChange = {
    kind: 'postFields',
    post: { slugs, category, tags, authorSlug: author.slug },
    previous: { category: state.post.category, tags: state.post.tags ?? [] },
    ...(state.authorSlug !== author.slug ? { previousAuthorSlug: state.authorSlug } : {}),
    candidates: context.candidates,
    blogPages: blogPages(context.visibleCount, slugs, slugs),
    landingShowsRecentPosts: false,
  }
  const targets = isPublic ? affectedUrls(siteUrl, change) : { urls: [], host: false }
  const nowS = yield* nowSeconds
  const now = fromUnixSeconds(nowS)
  const revision = input.revision + 1
  yield* runBatch((d) => [
    guard(d, sql`${postRevisionSql(input.postId)} = ${input.revision}`),
    d
      .update(p)
      .set({
        category,
        tags,
        authorId: input.authorId,
        coverAssetId: input.coverAssetId,
        coverImage: cover !== null ? blogImagePath(cover.r2Key) : keepLegacyCover ? state.post.coverImage : null,
        featured: input.featured,
        tableOfContents: input.tableOfContents,
        revision,
        updatedAt: now,
        updatedByUserId: actor.userId,
      })
      .where(eq(p.id, input.postId)),
    ...enqueuePurges(d, { targets, hostname: siteUrl.hostname, reason: 'post-meta', now: nowS }),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new ContentConflict())))
  return { revision, urls: publicUrls(slugs), purgeTargets: targets.urls.length, purge: yield* purgeAfter(targets.urls.length) }
})

/** Draft (or, without one, the live text) of a translation, as the source of a preview or a publish. */
const sourceOf = (state: PostState, locale: Locale) => {
  const draft = state.drafts.get(locale)
  if (draft !== undefined) return { source: 'draft' as const, row: draft }
  const live = state.translations.get(locale)
  return live !== undefined && isLive(live) ? { source: 'live' as const, row: live } : null
}

/**
 * `previewDraft(postId, locale)`: the public post template's data built from the draft (or the live text) with the
 * same renderer as the publish, so the preview cannot differ from what goes live. Nothing is written.
 */
export const previewDraft = Effect.fn('previewDraft')(function* (input: { readonly postId: string; readonly locale: Locale }) {
  const state = yield* loadPost(input.postId)
  const found = sourceOf(state, input.locale)
  if (found === null) return yield* new PostUnavailable()
  const fields = yield* checkDraft(fieldsOf(found.row))
  const rendered = yield* renderForStorage(fields.contentMd, input.locale)
  const db = yield* Db
  const authorTr = alias(schema.authorTranslations, 'author_tr')
  const avatar = alias(schema.cmsAssets, 'avatar_asset')
  const [authors, og] = yield* db.use((d) =>
    d.batch([
      d
        .select({
          name: a.name,
          slug: a.slug,
          bio: a.bio,
          role: a.role,
          socialLinks: a.socialLinks,
          avatarUrl: a.avatarUrl,
          avatarKey: named<string | null>(avatar.r2Key, 'avatarKey'),
          trBio: named<string | null>(authorTr.bio, 'trBio'),
          trJobTitle: authorTr.jobTitle,
        })
        .from(a)
        .leftJoin(avatar, eq(avatar.id, a.avatarAssetId))
        .leftJoin(authorTr, and(eq(authorTr.authorId, a.id), eq(authorTr.locale, input.locale)))
        .where(eq(a.userId, state.post.authorId))
        .limit(1),
      d.select().from(schema.cmsAssets).where(eq(schema.cmsAssets.id, fields.ogAssetId ?? '')).limit(1),
    ]),
  )
  const now = yield* nowSeconds
  const live = state.translations.get(input.locale)
  const cover = coverOf(state)
  const coverRef = cover === null ? null : { url: cover.url, width: cover.width, height: cover.height, alt: fields.coverAlt ?? '' }
  const author = authors[0]
  const avatarUrl = author === undefined ? null : author.avatarKey !== null ? blogImagePath(author.avatarKey) : safeImageUrl(author.avatarUrl)
  const authorRef = author === undefined ? null : { name: author.name, slug: author.slug, avatar: avatarUrl === null ? null : { url: avatarUrl, width: null, height: null, alt: author.name } }
  const ogRow = og[0]
  const slug = fields.slug || 'preview'
  const post: PostView = {
    slug,
    title: fields.title,
    excerpt: fields.excerpt,
    category: state.post.category,
    publishedAt: live === undefined ? now : toUnixSeconds(live.publishedAt),
    updatedAt: now,
    readTimeMin: rendered.readTimeMin,
    featured: state.post.featured,
    cover: coverRef,
    author: authorRef,
    contentHtml: rendered.html,
    toc: rendered.toc,
    showToc: state.post.tableOfContents && rendered.toc.length > 1,
    tags: state.post.tags ?? [],
    metaTitle: fields.metaTitle,
    metaDescription: fields.metaDescription,
    keywords: fields.keywords,
    ogImage: ogRow === undefined ? coverRef : { url: blogImagePath(ogRow.r2Key), width: ogRow.width, height: ogRow.height, alt: ogRow.alt ?? fields.title },
    authorDetail:
      author === undefined || authorRef === null
        ? null
        : { ...authorRef, bio: author.trBio ?? author.bio, jobTitle: author.trJobTitle ?? author.role, sameAs: httpsLinks(author.socialLinks) },
    related: [],
    alternates: { en: paths.post('en', slug) },
  }
  return { post, locale: input.locale, source: found.source, warnings: rendered.warnings } satisfies PreviewResult
})

/**
 * `publishTranslation(postId, locale, revision)`: the draft goes live (docs/12 §3.2 "Yayın batch'i"). Refused for a
 * closed blog locale (D9), before `en` is live (K3), for an archived post, without a draft, with missing or invalid
 * fields, for a slug another post holds, and without purge config.
 */
export const publishTranslation = Effect.fn('publishTranslation')(function* (input: { readonly postId: string; readonly locale: Locale; readonly revision: number }, actor: Actor) {
  const { locale, postId } = input
  if (!blogLocales.includes(locale)) return yield* new PublishBlocked({ reason: 'locale-closed' })
  const state = yield* loadPost(postId)
  if (state.post.status === 'archived') return yield* new PublishBlocked({ reason: 'archived' })
  const draft = state.drafts.get(locale)
  if (draft === undefined) return yield* new PublishBlocked({ reason: 'no-draft' })
  if (draft.revision !== input.revision) return yield* new ContentConflict()
  const en = state.translations.get('en')
  if (locale !== 'en' && (state.post.status !== 'published' || en === undefined || !isLive(en))) return yield* new PublishBlocked({ reason: 'en-not-live' })
  const fields = yield* checkDraft(fieldsOf(draft))
  const invalid = [
    ...(slugAllowed(state, locale, fields.slug) ? [] : ['slug']),
    ...(fields.title === '' ? ['title'] : []),
    ...(fields.excerpt === '' ? ['excerpt'] : []),
    ...(fields.contentMd.trim() === '' ? ['contentMd'] : []),
  ]
  if (invalid.length > 0) return yield* new PublishBlocked({ reason: 'invalid-fields', fields: invalid })
  if (yield* slugTaken(postId, locale, fields.slug)) return yield* new SlugConflict()
  yield* requireConfigured

  const rendered = yield* renderForStorage(fields.contentMd, locale)
  const { siteUrl } = yield* AppConfig
  const context = yield* purgeContext(postId)
  const nowS = yield* nowSeconds
  const now = fromUnixSeconds(nowS)
  const previous = state.translations.get(locale)
  const previousSlug = previous !== undefined && isLive(previous) ? (previous.slug !== fields.slug ? previous.slug : undefined) : legacySlugAfterUnpublish(state, locale, fields.slug)
  // The first publish of this locale; for `en`, a legacy post keeps its original date.
  const publishedAt = previous !== undefined && isLive(previous) ? previous.publishedAt : locale === 'en' && state.post.publishedAt !== null ? state.post.publishedAt : now

  const before = visibleSlugs(state.post.status, state.translations)
  const afterTranslations = new Map(state.translations)
  afterTranslations.set(locale, { ...(previous ?? draftAsTranslation(draft)), slug: fields.slug, readTimeMin: rendered.readTimeMin })
  const after = visibleSlugs(locale === 'en' ? 'published' : state.post.status, afterTranslations)
  const targets = affectedUrls(siteUrl, {
    kind: 'postTranslation',
    locale,
    ...(previousSlug === undefined ? {} : { previousSlug }),
    post: { slugs: union(before, after), category: state.post.category, tags: state.post.tags ?? [], authorSlug: state.authorSlug },
    candidates: context.candidates,
    blogPages: blogPages(context.visibleCount, before, after),
    landingShowsRecentPosts: false,
  })

  const row = {
    slug: fields.slug,
    title: fields.title,
    excerpt: fields.excerpt,
    contentMd: fields.contentMd,
    contentHtml: rendered.html,
    toc: rendered.toc,
    readTimeMin: rendered.readTimeMin,
    metaTitle: fields.metaTitle,
    metaDescription: fields.metaDescription,
    keywords: [...fields.keywords],
    coverAlt: fields.coverAlt,
    ogAssetId: fields.ogAssetId,
    updatedAt: now,
    updatedByUserId: actor.userId,
  }
  yield* runBatch(
    (d) => [
      guard(d, sql`(SELECT x."revision" FROM ${dr} AS x WHERE x."postId" = ${postId} AND x."locale" = ${locale}) = ${input.revision}`),
      // Another post's old slug: the new owner takes it (its redirect would shadow nothing, but would confuse later).
      d.delete(schema.postSlugRedirects).where(and(eq(schema.postSlugRedirects.locale, locale), eq(schema.postSlugRedirects.slug, fields.slug))),
      d.insert(t).values({ postId, locale, ...row, publishedAt }).onConflictDoUpdate({ target: [t.postId, t.locale], set: { ...row, publishedAt } }),
      d.delete(dr).where(and(eq(dr.postId, postId), eq(dr.locale, locale))),
      ...(previousSlug === undefined
        ? []
        : [
            d
              .insert(schema.postSlugRedirects)
              .values({ locale, slug: previousSlug, postId, createdAt: now })
              .onConflictDoUpdate({ target: [schema.postSlugRedirects.locale, schema.postSlugRedirects.slug], set: { postId, createdAt: now } }),
          ]),
      // The legacy mirror (§1.5 step 3): the old Worker reads `posts` only.
      ...(locale === 'en'
        ? [
            d
              .update(p)
              .set({
                slug: fields.slug,
                title: fields.title,
                excerpt: fields.excerpt,
                content: fields.contentMd,
                metaTitle: fields.metaTitle,
                metaDescription: fields.metaDescription,
                keywords: [...fields.keywords],
                readTime: rendered.readTimeMin,
                status: 'published',
                publishedAt: state.post.publishedAt ?? publishedAt,
                updatedAt: now,
                updatedByUserId: actor.userId,
              })
              .where(eq(p.id, postId)),
          ]
        : []),
      ...enqueuePurges(d, { targets, hostname: siteUrl.hostname, reason: 'publish', now: nowS }),
    ],
    [
      ['post_translations.locale, post_translations.slug', () => new SlugConflict()],
      ['posts.slug', () => new SlugConflict()],
    ],
  ).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new ContentConflict())))
  return { urls: publicUrls(after), purgeTargets: targets.urls.length, purge: yield* purgeAfter(targets.urls.length), warnings: rendered.warnings } satisfies PublishResult
})

/**
 * The `en` URL a post had before it was taken down: unpublishing deletes the translation row but keeps the legacy
 * mirror's `posts.slug`, so a republish under a new slug still redirects the old URL (and purges it). Never the
 * placeholder of a post that was never published. Other locales keep no such trace (docs/12 6c-2 notes).
 */
const legacySlugAfterUnpublish = (state: PostState, locale: Locale, slug: string) =>
  locale === 'en' && state.post.publishedAt !== null && state.post.slug !== slug && !state.post.slug.startsWith('draft-') ? state.post.slug : undefined

const draftAsTranslation = (draft: DraftRow): TranslationRow => ({
  postId: draft.postId,
  locale: draft.locale,
  slug: draft.slug,
  title: draft.title,
  excerpt: draft.excerpt,
  contentMd: draft.contentMd,
  contentHtml: '',
  toc: [],
  readTimeMin: 0,
  metaTitle: draft.metaTitle,
  metaDescription: draft.metaDescription,
  keywords: draft.keywords,
  coverAlt: draft.coverAlt,
  ogAssetId: draft.ogAssetId,
  publishedAt: draft.updatedAt,
  updatedAt: draft.updatedAt,
  updatedByUserId: draft.updatedByUserId,
})

/**
 * `unpublishTranslation(postId, locale, confirm)`: the translation leaves the site; its text becomes the draft unless
 * a draft exists. Taking `en` down makes the post a draft (every locale 404, §2) and needs `confirm` while other
 * locales are live (`PublishBlocked` `other-locales-live` lists them).
 */
export const unpublishTranslation = Effect.fn('unpublishTranslation')(function* (input: { readonly postId: string; readonly locale: Locale; readonly confirm: boolean }, actor: Actor) {
  const { locale, postId } = input
  const state = yield* loadPost(postId)
  // Taking `en` down would set the post to draft and silently undo the archive (its URLs would turn from 410 to 404).
  if (state.post.status === 'archived') return yield* new PublishBlocked({ reason: 'archived' })
  const live = state.translations.get(locale)
  if (live === undefined || !isLive(live)) return yield* new PublishBlocked({ reason: 'not-live' })
  if (locale === 'en' && !input.confirm) {
    const others = LOCALES.filter((l) => l !== 'en' && state.translations.has(l) && isLive(state.translations.get(l) as TranslationRow))
    if (others.length > 0) return yield* new PublishBlocked({ reason: 'other-locales-live', fields: others })
  }
  const before = visibleSlugs(state.post.status, state.translations)
  const isPublic = Object.keys(before).length > 0
  if (isPublic) yield* requireConfigured
  const { siteUrl } = yield* AppConfig
  const context = yield* purgeContext(postId)
  const afterTranslations = new Map(state.translations)
  afterTranslations.delete(locale)
  const after = visibleSlugs(locale === 'en' ? 'draft' : state.post.status, afterTranslations)
  const targets = isPublic
    ? affectedUrls(siteUrl, {
        kind: 'postTranslation',
        locale,
        post: { slugs: before, category: state.post.category, tags: state.post.tags ?? [], authorSlug: state.authorSlug },
        candidates: context.candidates,
        blogPages: blogPages(context.visibleCount, before, after),
        landingShowsRecentPosts: false,
      })
    : { urls: [], host: false }
  const nowS = yield* nowSeconds
  const now = fromUnixSeconds(nowS)
  const keepDraft = state.drafts.has(locale)
  yield* runBatch((d) => [
    ...(keepDraft
      ? []
      : [
          d
            .insert(dr)
            .values({ ...fieldsOf(live), keywords: [...(live.keywords ?? [])], postId, locale, revision: toUnixSeconds(live.updatedAt) + 1, updatedAt: now, updatedByUserId: actor.userId })
            .onConflictDoNothing(),
        ]),
    d.delete(t).where(and(eq(t.postId, postId), eq(t.locale, locale))),
    ...(locale === 'en' ? [d.update(p).set({ status: 'draft', updatedAt: now, updatedByUserId: actor.userId }).where(eq(p.id, postId))] : []),
    ...enqueuePurges(d, { targets, hostname: siteUrl.hostname, reason: 'unpublish', now: nowS }),
  ])
  return { urls: publicUrls(after), purgeTargets: targets.urls.length, purge: yield* purgeAfter(targets.urls.length) } satisfies PublishResult
})

/** Archive (every URL 410, out of lists and sitemaps) or restore (back to published when `en` is live, else draft). */
const setArchived = (name: 'archivePost' | 'restorePost', archived: boolean) =>
  Effect.fn(name)(function* (input: { readonly postId: string }, actor: Actor) {
    const state = yield* loadPost(input.postId)
    const nextStatus = archived ? 'archived' : state.translations.has('en') && isLive(state.translations.get('en') as TranslationRow) ? 'published' : 'draft'
    const before = visibleSlugs(state.post.status, state.translations)
    const after = visibleSlugs(nextStatus, state.translations)
    const slugs = union(before, after)
    const touchesPublic = Object.keys(slugs).length > 0
    if (touchesPublic) yield* requireConfigured
    const { siteUrl } = yield* AppConfig
    const context = yield* purgeContext(input.postId)
    const targets = touchesPublic
      ? affectedUrls(siteUrl, {
          kind: 'postFields',
          post: { slugs, category: state.post.category, tags: state.post.tags ?? [], authorSlug: state.authorSlug },
          candidates: context.candidates,
          blogPages: blogPages(context.visibleCount, before, after),
          landingShowsRecentPosts: false,
        })
      : { urls: [], host: false }
    const nowS = yield* nowSeconds
    yield* runBatch((d) => [
      d.update(p).set({ status: nextStatus, updatedAt: fromUnixSeconds(nowS), updatedByUserId: actor.userId }).where(eq(p.id, input.postId)),
      ...enqueuePurges(d, { targets, hostname: siteUrl.hostname, reason: archived ? 'archive' : 'restore', now: nowS }),
    ])
    return { status: nextStatus, urls: publicUrls(after), purgeTargets: targets.urls.length, purge: yield* purgeAfter(targets.urls.length) }
  })

export const archivePost = setArchived('archivePost', true)
export const restorePost = setArchived('restorePost', false)

/** `deletePost(postId)`: only a post that was never published in any locale (else archive it). Drafts go with it. */
export const deletePost = Effect.fn('deletePost')(function* (input: { readonly postId: string }) {
  const state = yield* loadPost(input.postId)
  if (state.translations.size > 0 || state.post.publishedAt !== null || state.post.status === 'published') return yield* new PublishBlocked({ reason: 'published-before' })
  yield* runBatch((d) => [d.delete(p).where(and(eq(p.id, input.postId), sql`${p.publishedAt} IS NULL`, sql`NOT EXISTS (SELECT 1 FROM ${t} AS x WHERE x."postId" = ${p.id})`))])
  return { deleted: true }
})
