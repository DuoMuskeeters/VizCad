/**
 * Author profiles behind `/api/cms` (docs/12 §3.2 `listAuthors`, `saveAuthor`; §9 "Yazarlar"). Callers are platform
 * admins (http/cms.ts checks `canManageContent` first).
 *
 * - **K13.** Every author is a real account: a profile belongs to one user (`author_profiles.userId`, unique). New
 *   profiles are offered for platform admins without one.
 * - **Per locale** job title and bio live in `author_translations`. The legacy `bio` / `role` columns mirror `en`, and
 *   `avatarUrl` mirrors an uploaded avatar as its `/api/blog/image/...` URL, so the old Worker reads the same author
 *   after a rollback (§1.5 step 5).
 * - **Lock.** The profile's `updatedAt` (seconds) is its revision; a stale copy gets `ContentConflict`.
 * - **Purge.** A change to an author with public posts queues the author page (every blog locale, the old slug too)
 *   and the posts' URLs (`affectedUrls` kind `author`); without purge config that is `CacheError` before any write.
 * - **Delete** only for an author without posts (`AuthorHasPosts`). The 0016 triggers still guard the user and its
 *   accounts: a user who wrote posts can never be deleted (`author_has_posts`).
 */
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { type AdminAuthor, type AdminAuthorList, AUTHOR_LIMITS, type AuthorSaved, type AuthorTranslation } from '#/shared/cmsTypes'
import { blogLocales, LOCALES, type Locale } from '#/shared/marketingRoutes'
import { affectedUrls } from '../../cms/affectedUrls'
import { isValidSlug } from '../../cms/slug'
import * as schema from '../../db/schema'
import { AssetUnavailable, AuthorHasPosts, AuthorUnavailable, ContentConflict, SlugConflict, TextTooLong, ValidationError } from '../../errors'
import { AppConfig } from '../../services/AppConfig'
import { Db } from '../../services/Db'
import { fromUnixSeconds, toUnixSeconds } from '../../time'
import { drainCachePurges, enqueuePurges, PUBLISH_MAX_CALLS } from '../cachePurges'
import { guard, newId, nowSeconds, runBatch } from '../shared'
import { blogImagePath, httpsLinks, safeImageUrl } from './blog'
import { requireConfigured } from './cache'

const a = schema.authorProfiles
const at = schema.authorTranslations
const p = schema.posts
const t = schema.postTranslations

type ProfileRow = typeof schema.authorProfiles.$inferSelect

const blankToNull = (value: string | null | undefined) => (value === null || value === undefined || value.trim() === '' ? null : value.trim())

// ---------------------------------------------------------------------------------------------------------------------
// Reads

/** `listAuthors`: every profile (name order) with its translations and post count, and the admins without a profile. */
export const listAuthors = Effect.fn('listAuthors')(function* () {
  const db = yield* Db
  const [profiles, translations, counts, candidates] = yield* db.use((d) =>
    d.batch([
      d
        .select({ profile: a, email: schema.user.email, avatarKey: schema.cmsAssets.r2Key, avatarWidth: schema.cmsAssets.width, avatarHeight: schema.cmsAssets.height })
        .from(a)
        .innerJoin(schema.user, eq(schema.user.id, a.userId))
        .leftJoin(schema.cmsAssets, eq(schema.cmsAssets.id, a.avatarAssetId))
        .orderBy(asc(a.name))
        .limit(500),
      d.select().from(at),
      d.select({ authorId: p.authorId, n: count() }).from(p).groupBy(p.authorId),
      d
        .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email })
        .from(schema.user)
        .leftJoin(a, eq(a.userId, schema.user.id))
        .where(and(eq(schema.user.role, 'admin'), isNull(a.id)))
        .orderBy(asc(schema.user.name))
        .limit(200),
    ]),
  )
  const postsBy = new Map(counts.map((c) => [c.authorId, c.n]))
  const translationsBy = new Map<string, Partial<Record<Locale, AuthorTranslation>>>()
  for (const row of translations) {
    const entry = translationsBy.get(row.authorId) ?? {}
    entry[row.locale] = { bio: row.bio, jobTitle: row.jobTitle }
    translationsBy.set(row.authorId, entry)
  }
  return {
    rows: profiles.map(({ profile, email, avatarKey, avatarWidth, avatarHeight }): AdminAuthor => {
      const own = translationsBy.get(profile.id) ?? {}
      const avatarUrl = avatarKey !== null ? blogImagePath(avatarKey) : safeImageUrl(profile.avatarUrl)
      return {
        id: profile.id,
        userId: profile.userId,
        userEmail: email,
        name: profile.name,
        slug: profile.slug,
        avatar: avatarUrl === null ? null : { assetId: profile.avatarAssetId, url: avatarUrl, width: avatarWidth, height: avatarHeight },
        sameAs: httpsLinks(profile.socialLinks),
        // `en` without its own row reads the legacy columns (§1.3 `author_translations`).
        translations: { ...(profile.bio !== null || profile.role !== null ? { en: { bio: profile.bio, jobTitle: profile.role } } : {}), ...own },
        posts: postsBy.get(profile.userId) ?? 0,
        revision: toUnixSeconds(profile.updatedAt),
      }
    }),
    candidates,
  } satisfies AdminAuthorList
})

// ---------------------------------------------------------------------------------------------------------------------
// Writes

export interface AuthorInput {
  /** Absent: a new profile for `userId`. */
  readonly authorId?: string | undefined
  readonly userId: string
  readonly name: string
  readonly slug: string | null
  readonly avatarAssetId: string | null
  /** Also drop a legacy URL-only avatar (`avatarUrl` without an asset). */
  readonly removeAvatar?: boolean | undefined
  readonly sameAs: ReadonlyArray<string>
  readonly translations: Readonly<Partial<Record<Locale, AuthorTranslation>>>
  /** The profile's lock (`updatedAt` seconds); 0 for a new profile. */
  readonly revision: number
}

/** Social profile keys from the host (`linkedin`, `x`, `github` …), `website` otherwise, numbered on repeats. */
const linkKey = (url: URL) => {
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'twitter.com' || host === 'x.com') return 'x'
  const known = ['linkedin', 'github', 'youtube', 'instagram', 'facebook', 'mastodon', 'medium'].find((name) => host === `${name}.com` || host.endsWith(`.${name}.com`))
  return known ?? 'website'
}

const checkLinks = Effect.fnUntraced(function* (raw: ReadonlyArray<string>) {
  const links = [...new Set(raw.map((l) => l.trim()).filter((l) => l !== ''))]
  if (links.length > AUTHOR_LIMITS.links) return yield* new TextTooLong({ field: 'sameAs', max: AUTHOR_LIMITS.links })
  const out: Record<string, string> = {}
  for (const link of links) {
    if (link.length > AUTHOR_LIMITS.link) return yield* new TextTooLong({ field: 'sameAs', max: AUTHOR_LIMITS.link })
    // https only, the same rule the public page applies (blog.ts `httpsLinks`).
    if (!/^https:\/\/[^/\\]/i.test(link) || !URL.canParse(link)) return yield* new ValidationError({ message: 'sameAs must be https URLs' })
    const base = linkKey(new URL(link))
    let key = base
    for (let n = 2; Object.hasOwn(out, key); n++) key = `${base}${n}`
    out[key] = link
  }
  return out
})

const checkTranslations = Effect.fnUntraced(function* (input: AuthorInput['translations']) {
  const out: Partial<Record<Locale, AuthorTranslation>> = {}
  for (const locale of LOCALES) {
    const value = input[locale]
    if (value === undefined) continue
    const bio = blankToNull(value.bio)
    const jobTitle = blankToNull(value.jobTitle)
    if ((bio?.length ?? 0) > AUTHOR_LIMITS.bio) return yield* new TextTooLong({ field: `bio.${locale}`, max: AUTHOR_LIMITS.bio })
    if ((jobTitle?.length ?? 0) > AUTHOR_LIMITS.jobTitle) return yield* new TextTooLong({ field: `jobTitle.${locale}`, max: AUTHOR_LIMITS.jobTitle })
    out[locale] = { bio, jobTitle }
  }
  return out
})

/** The public URLs of the author's live posts (locale → slug per post). */
const authorPosts = Effect.fnUntraced(function* (userId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) =>
    d
      .select({ postId: t.postId, locale: t.locale, slug: t.slug })
      .from(t)
      .innerJoin(p, eq(p.id, t.postId))
      .where(and(eq(p.authorId, userId), eq(p.status, 'published'), sql`${t.readTimeMin} > 0`, sql`EXISTS (SELECT 1 FROM ${t} AS e WHERE e."postId" = ${t.postId} AND e."locale" = 'en' AND e."readTimeMin" > 0)`))
      .limit(2000),
  )
  const byPost = new Map<string, Partial<Record<Locale, string>>>()
  for (const row of rows) {
    const slugs = byPost.get(row.postId) ?? {}
    if (blogLocales.includes(row.locale)) slugs[row.locale] = row.slug
    byPost.set(row.postId, slugs)
  }
  return [...byPost.values()].filter((slugs) => Object.keys(slugs).length > 0).map((slugs) => ({ slugs }))
})

const purgeAfter = (count: number) =>
  count === 0
    ? Effect.succeed(null)
    : drainCachePurges({ maxCalls: PUBLISH_MAX_CALLS }).pipe(
        Effect.catch((error) => Effect.logWarning('cms purge after author change failed').pipe(Effect.annotateLogs({ error: error._tag }), Effect.as(null))),
      )

/**
 * `saveAuthor`: creates or updates a profile with its translations in one batch (profile, `en` mirror, translation
 * upserts and removals, purge rows). Refused: unknown user (`AuthorUnavailable`), a user who already has a profile or a
 * stale copy (`ContentConflict`), a slug outside §4.2 (`ValidationError`) or held by another author (`SlugConflict`),
 * an unknown avatar (`AssetUnavailable`), over-long text (`TextTooLong`).
 */
export const saveAuthor = Effect.fn('saveAuthor')(function* (input: AuthorInput) {
  const name = input.name.trim()
  if (name === '') return yield* new ValidationError({ message: 'name required' })
  if (name.length > AUTHOR_LIMITS.name) return yield* new TextTooLong({ field: 'name', max: AUTHOR_LIMITS.name })
  const slug = blankToNull(input.slug)
  const socialLinks = yield* checkLinks(input.sameAs)
  const translations = yield* checkTranslations(input.translations)
  const db = yield* Db

  let current: ProfileRow | undefined
  if (input.authorId === undefined) {
    const users = yield* db.use((d) => d.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, input.userId)).limit(1))
    if (users.length === 0) return yield* new AuthorUnavailable()
    if (input.revision !== 0) return yield* new ContentConflict()
  } else {
    const rows = yield* db.use((d) => d.select().from(a).where(eq(a.id, input.authorId ?? '')).limit(1))
    current = rows[0]
    if (current === undefined) return yield* new AuthorUnavailable()
    // The profile's user never changes (K13: the person is the author); a different one is a bad request.
    if (current.userId !== input.userId) return yield* new ValidationError({ message: 'userId cannot change' })
    if (toUnixSeconds(current.updatedAt) !== input.revision) return yield* new ContentConflict()
  }
  // A legacy slug is kept until it is changed (like post slugs, §4.2).
  if (slug !== null && !isValidSlug(slug) && slug !== current?.slug) return yield* new ValidationError({ message: 'invalid slug' })

  let avatarKey: string | null = null
  if (input.avatarAssetId !== null) {
    const assets = yield* db.use((d) => d.select({ r2Key: schema.cmsAssets.r2Key }).from(schema.cmsAssets).where(eq(schema.cmsAssets.id, input.avatarAssetId ?? '')).limit(1))
    const asset = assets[0]
    if (asset === undefined) return yield* new AssetUnavailable()
    avatarKey = asset.r2Key
  }
  const keepLegacyAvatar = input.avatarAssetId === null && (current?.avatarAssetId ?? null) === null && input.removeAvatar !== true
  const avatarUrl = avatarKey !== null ? blogImagePath(avatarKey) : keepLegacyAvatar ? (current?.avatarUrl ?? null) : null

  // A new profile too: the user may already have public posts (a byline and JSON-LD that now change).
  const posts = yield* authorPosts(current?.userId ?? input.userId)
  const isPublic = posts.length > 0
  if (isPublic) yield* requireConfigured
  const { siteUrl } = yield* AppConfig
  const targets = isPublic ? affectedUrls(siteUrl, { kind: 'author', authorSlug: slug, previousSlug: current?.slug ?? null, posts }) : { urls: [], host: false }

  const nowS = yield* nowSeconds
  // The lock is `updatedAt`: it must move even when two saves fall in the same second.
  const revision = Math.max(nowS, input.revision + 1)
  const updatedAt = fromUnixSeconds(revision)
  const id = current?.id ?? (yield* newId)
  const en = translations.en
  const legacy = en === undefined ? {} : { bio: en.bio, role: en.jobTitle }
  const profile = { name, slug, avatarAssetId: input.avatarAssetId, avatarUrl, socialLinks, ...legacy, updatedAt }

  yield* runBatch(
    (d) => [
      ...(current === undefined
        ? [d.insert(a).values({ id, userId: input.userId, ...profile, createdAt: updatedAt })]
        : [
            guard(d, sql`(SELECT x."updatedAt" FROM ${a} AS x WHERE x."id" = ${id}) = ${input.revision}`),
            d.update(a).set(profile).where(eq(a.id, id)),
          ]),
      ...Object.entries(translations).map(([locale, value]) =>
        value.bio === null && value.jobTitle === null
          ? d.delete(at).where(and(eq(at.authorId, id), eq(at.locale, locale as Locale)))
          : d
              .insert(at)
              .values({ authorId: id, locale: locale as Locale, bio: value.bio, jobTitle: value.jobTitle, updatedAt })
              .onConflictDoUpdate({ target: [at.authorId, at.locale], set: { bio: value.bio, jobTitle: value.jobTitle, updatedAt } }),
      ),
      ...enqueuePurges(d, { targets, hostname: siteUrl.hostname, reason: 'author', now: nowS }),
    ],
    [
      ['author_profiles.slug', (): SlugConflict | ContentConflict => new SlugConflict()],
      ['author_profiles.userId', (): SlugConflict | ContentConflict => new ContentConflict()],
    ],
  ).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new ContentConflict())))
  return { id, revision, purgeTargets: targets.urls.length, purge: yield* purgeAfter(targets.urls.length) } satisfies AuthorSaved
})

/**
 * `deleteAuthor(authorId)`: only without posts (any status; `AuthorHasPosts` otherwise). The batch re-checks at write
 * time, so a post assigned in between still blocks it. Translations go with the profile (cascade).
 */
export const deleteAuthor = Effect.fn('deleteAuthor')(function* (input: { readonly authorId: string }) {
  const db = yield* Db
  const rows = yield* db.use((d) => d.select({ userId: a.userId }).from(a).where(eq(a.id, input.authorId)).limit(1))
  const row = rows[0]
  if (row === undefined) return yield* new AuthorUnavailable()
  const posts = yield* db.use((d) => d.select({ n: count() }).from(p).where(eq(p.authorId, row.userId)))
  if ((posts[0]?.n ?? 0) > 0) return yield* new AuthorHasPosts()
  yield* runBatch((d) => [
    guard(d, sql`NOT EXISTS (SELECT 1 FROM ${p} AS x WHERE x."authorId" = ${row.userId})`),
    d.delete(a).where(eq(a.id, input.authorId)),
  ]).pipe(Effect.catchTag('WriteConflict', () => Effect.fail(new AuthorHasPosts())))
  return { deleted: true }
})
