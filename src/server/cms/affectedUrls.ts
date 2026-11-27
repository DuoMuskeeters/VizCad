/**
 * Which cached URLs a CMS change makes stale (docs/12 §7.4). Pure: the caller (the publish program) loads the snapshot
 * from D1, this decides the purge list. The URLs are absolute on the site origin without the `?v=` build suffix (the
 * purge client adds it). Blog, author and RSS URLs exist only in `blogLocales` (D9): outside it they are 404, never
 * cached, so they are never listed.
 */
import {
  blogLocales,
  LOCALES,
  type LegalKind,
  type Locale,
  type PageKey,
  paths,
} from '#/shared/marketingRoutes'

/** A post as the change sees it. `slugs`: every locale the post is (or, for an unpublish, was) published in. */
export interface PostSnapshot {
  readonly slugs: Partial<Record<Locale, string>>
  readonly category: string
  readonly tags: ReadonlyArray<string>
  readonly authorSlug: string | null
}

/** Another published post; its pages list related posts, so it may show the changed one. */
export interface RelatedCandidate {
  readonly slugs: Partial<Record<Locale, string>>
  readonly category: string
  readonly tags: ReadonlyArray<string>
}

/** What the post pages around the change look like (shared by the post changes). */
interface PostContext {
  readonly post: PostSnapshot
  /** Other published posts (the program may prefilter; this keeps only those sharing a category or tag). */
  readonly candidates: ReadonlyArray<RelatedCandidate>
  /** Number of blog list pages per locale (default 1). */
  readonly blogPages: Partial<Record<Locale, number>>
  /** The landing shows recent posts (set once 6f builds it). */
  readonly landingShowsRecentPosts: boolean
}

export type ContentChange =
  /** A translation in `locale` was published or unpublished. `previousSlug`: its slug before, if it changed. */
  | ({ readonly kind: 'postTranslation'; readonly locale: Locale; readonly previousSlug?: string } & PostContext)
  /** Archive/restore, or post-level fields (cover, author, category, tags). `previous`: category/tags before the change. */
  | ({ readonly kind: 'postFields'; readonly previous?: { readonly category: string; readonly tags: ReadonlyArray<string> }; readonly previousAuthorSlug?: string | null } & PostContext)
  /** Page texts or page SEO of one page in one locale. `liveChanged`: `page_seo.live` flipped. */
  | { readonly kind: 'pageTexts'; readonly pageKey: PageKey; readonly locale: Locale; readonly liveChanged: boolean }
  /** Top bar / footer texts: on every page. */
  | { readonly kind: 'sharedTexts' }
  /** `site_settings` (organization, default OG): in every page's head. */
  | { readonly kind: 'settings' }
  | { readonly kind: 'author'; readonly authorSlug: string | null; readonly previousSlug?: string | null; readonly posts: ReadonlyArray<{ readonly slugs: Partial<Record<Locale, string>> }> }
  | { readonly kind: 'legal'; readonly legalKind: LegalKind; readonly locale: Locale }

export interface PurgeTargets {
  /** Absolute URLs, deduplicated, in a stable order. */
  readonly urls: ReadonlyArray<string>
  /** A hostname purge of the site host (one API call instead of a URL list). */
  readonly host: boolean
}

const isBlogLocale = (locale: Locale) => blogLocales.includes(locale)

const entries = (slugs: Partial<Record<Locale, string>>): ReadonlyArray<readonly [Locale, string]> =>
  LOCALES.flatMap((locale) => {
    const slug = slugs[locale]
    return slug === undefined ? [] : [[locale, slug] as const]
  })

const sharesTopic = (candidate: RelatedCandidate, categories: ReadonlySet<string>, tags: ReadonlySet<string>) =>
  categories.has(candidate.category) || candidate.tags.some((tag) => tags.has(tag))

/** The post-page fan-out of one locale (the `postTranslation` row of the table). */
const postLocalePaths = (
  locale: Locale,
  context: PostContext,
  categories: ReadonlySet<string>,
  tags: ReadonlySet<string>,
  authorSlugs: ReadonlyArray<string | null>,
): Array<string> => {
  const out: Array<string> = []
  // Every locale of the post: their hreflang lists change.
  for (const [l, slug] of entries(context.post.slugs)) if (isBlogLocale(l)) out.push(paths.post(l, slug))
  // Every locale's sitemap the post is in lists its alternates, plus the index.
  for (const [l] of entries(context.post.slugs)) out.push(paths.sitemap(l))
  out.push(paths.sitemapIndex())
  if (!isBlogLocale(locale)) return out
  // Related posts in this locale that may show the post.
  for (const candidate of context.candidates) {
    const slug = candidate.slugs[locale]
    if (slug !== undefined && sharesTopic(candidate, categories, tags)) out.push(paths.post(locale, slug))
  }
  const pages = Math.max(1, context.blogPages[locale] ?? 1)
  for (let page = 1; page <= pages; page++) out.push(paths.blogList(locale, page))
  out.push(paths.rss(locale))
  for (const authorSlug of authorSlugs) {
    if (authorSlug !== null) for (const l of blogLocales) out.push(paths.author(l, authorSlug))
  }
  if (locale === 'en') out.push(paths.llms())
  if (context.landingShowsRecentPosts) out.push(paths.page(locale, 'landing'))
  return out
}

const changePaths = (change: ContentChange): { readonly paths: Array<string>; readonly host: boolean } => {
  switch (change.kind) {
    case 'postTranslation': {
      const out = postLocalePaths(change.locale, change, new Set([change.post.category]), new Set(change.post.tags), [change.post.authorSlug])
      if (change.previousSlug !== undefined && isBlogLocale(change.locale)) out.push(paths.post(change.locale, change.previousSlug))
      return { paths: out, host: false }
    }
    case 'postFields': {
      // Union over every locale of the post; related posts matched on both old and new category/tags.
      const categories = new Set([change.post.category, ...(change.previous ? [change.previous.category] : [])])
      const tags = new Set([...change.post.tags, ...(change.previous?.tags ?? [])])
      const authors = [change.post.authorSlug, ...(change.previousAuthorSlug === undefined ? [] : [change.previousAuthorSlug])]
      const out = entries(change.post.slugs).flatMap(([locale]) => postLocalePaths(locale, change, categories, tags, authors))
      return { paths: out, host: false }
    }
    case 'pageTexts': {
      // `blog` and `legal` texts are page shells shown on many URLs (every post, every legal page): one host purge.
      if (change.pageKey === 'blog' || change.pageKey === 'legal') return { paths: [], host: true }
      const key = change.pageKey
      const locales = change.liveChanged ? LOCALES : [change.locale]
      const out = locales.map((locale) => paths.page(locale, key))
      if (change.liveChanged) out.push(paths.sitemap(change.locale), paths.sitemapIndex())
      return { paths: out, host: false }
    }
    case 'sharedTexts':
    case 'settings':
      return { paths: [], host: true }
    case 'author': {
      const out: Array<string> = []
      for (const slug of [change.authorSlug, change.previousSlug ?? null]) {
        if (slug !== null) for (const l of blogLocales) out.push(paths.author(l, slug))
      }
      for (const post of change.posts) for (const [l, slug] of entries(post.slugs)) if (isBlogLocale(l)) out.push(paths.post(l, slug))
      if (change.previousSlug !== undefined && change.previousSlug !== change.authorSlug) {
        for (const l of blogLocales) out.push(paths.sitemap(l))
        out.push(paths.sitemapIndex())
      }
      return { paths: out, host: false }
    }
    case 'legal':
      return { paths: [paths.legal(change.locale, change.legalKind), paths.sitemap(change.locale), paths.sitemapIndex()], host: false }
  }
}

export const affectedUrls = (siteUrl: URL, changes: ContentChange | ReadonlyArray<ContentChange>): PurgeTargets => {
  const list: ReadonlyArray<ContentChange> = Array.isArray(changes) ? changes : [changes as ContentChange]
  const urls = new Set<string>()
  let host = false
  for (const change of list) {
    const result = changePaths(change)
    host ||= result.host
    for (const path of result.paths) urls.add(new URL(path, siteUrl.origin).href)
  }
  return { urls: [...urls], host }
}
