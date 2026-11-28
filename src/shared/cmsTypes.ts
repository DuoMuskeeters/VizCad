/**
 * Serializable shapes of the admin CMS API (`/api/cms`, docs/12 §3.2), shared by the server programs
 * (programs/cms/posts.ts) and the admin screens. Types and plain constants only: no `effect`, no server code, so the
 * admin chunk can import it. Dates are Unix seconds.
 */
import type { Locale } from '#/i18n/locales'
import type { PostView } from './blogTypes'

/** Field limits (characters; `contentMd` in UTF-8 bytes). The server checks them (`TextTooLong`), the editor counts. */
export const POST_LIMITS = {
  title: 120,
  excerpt: 300,
  metaTitle: 120,
  metaDescription: 300,
  coverAlt: 200,
  keyword: 60,
  keywords: 20,
  category: 60,
  tag: 40,
  tags: 20,
  /**
   * Markdown source per translation, in bytes. Set by the CPU gate (docs/12 §7.5, Faz 6c notes): rendering runs inside
   * the publish request on the Free plan's 10 ms CPU budget.
   */
  contentMd: 20 * 1024,
} as const

/** Search-result lengths the SEO panel's counters recommend (not enforced). */
export const SEO_HINTS = { metaTitle: 60, metaDescription: 155 } as const

export type PostStatus = 'draft' | 'published' | 'archived'

/** Per-locale state in lists: live, a draft only, live with an unpublished draft, or nothing. */
export type Coverage = 'live' | 'draft' | 'live-draft' | 'none'

export interface AdminPostRow {
  readonly id: string
  /** The `en` title: draft first, then live, then the legacy column. */
  readonly title: string
  readonly status: PostStatus
  readonly coverage: Readonly<Record<Locale, Coverage>>
  readonly authorName: string | null
  /** Last publish of any locale, or null. */
  readonly lastPublishedAt: number | null
  /** Legacy view counter, frozen (K7). */
  readonly views: number
  readonly updatedAt: number
}

export interface AdminPostList {
  readonly rows: ReadonlyArray<AdminPostRow>
  /** Pass back as `cursor` for the next page; null on the last page. */
  readonly next: string | null
}

/** The editable fields of one translation (draft or live). */
export interface TranslationFields {
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

export interface LocaleState {
  readonly live: (TranslationFields & { readonly publishedAt: number; readonly updatedAt: number }) | null
  readonly draft: (TranslationFields & { readonly updatedAt: number }) | null
  /** Send back with `saveDraft` / `publishTranslation` (optimistic lock). */
  readonly revision: number
}

export interface AdminImage {
  readonly assetId: string | null
  readonly url: string
  readonly width: number | null
  readonly height: number | null
}

export interface AdminPost {
  readonly id: string
  readonly status: PostStatus
  readonly category: string
  readonly tags: ReadonlyArray<string>
  /** The author's user id (K13: an author is a user with an author profile). */
  readonly authorId: string
  readonly cover: AdminImage | null
  readonly featured: boolean
  readonly tableOfContents: boolean
  /** Post-level fields' optimistic lock (`updatePostMeta`). */
  readonly revision: number
  readonly views: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly locales: Readonly<Record<Locale, LocaleState>>
  /** Authors to pick from. */
  readonly authors: ReadonlyArray<{ readonly userId: string; readonly name: string }>
  /** Locales whose blog is open (D9/K14): only these can be published. */
  readonly publishable: ReadonlyArray<Locale>
}

/** What `renderMarkdown` reported (docs/12 §4.3). */
export interface RenderWarnings {
  readonly rawHtmlTags: ReadonlyArray<string>
  readonly droppedLinks: ReadonlyArray<string>
  readonly externalImages: ReadonlyArray<string>
}

export interface DraftSaved {
  readonly revision: number
  readonly updatedAt: number
  /** Hints shown under the slug field; publishing refuses the same cases. */
  readonly slugTaken: boolean
  readonly slugInvalid: boolean
}

export interface PurgeSummary {
  readonly done: number
  readonly failed: number
  readonly dropped: number
  readonly queued: number
  readonly calls: number
  readonly skipped?: 'not-configured'
}

export interface PublishResult {
  /** The post's public paths after the change (empty when nothing is public). */
  readonly urls: ReadonlyArray<string>
  /** URLs queued for purging. */
  readonly purgeTargets: number
  /** The immediate purge, or null when it could not run (the queue and the cron finish it). Content is live either way. */
  readonly purge: PurgeSummary | null
  readonly warnings?: RenderWarnings
}

export interface PreviewResult {
  readonly post: PostView
  readonly locale: Locale
  /** Where the preview came from: the draft, or the live text when there is no draft. */
  readonly source: 'draft' | 'live'
  readonly warnings: RenderWarnings
}

// ---------------------------------------------------------------------------------------------------------------------
// Images (6c-2, programs/cms/assets.ts)

/** Upload limits the editor checks before sending (the server checks them again, server/cms/imageInfo.ts). */
export const ASSET_UPLOAD = {
  bytes: 5 * 1024 * 1024,
  /** The editor scales the longest side down to this before upload (docs/12 §7.3). */
  scaleTo: 1600,
  types: ['image/png', 'image/jpeg', 'image/webp'],
  alt: 200,
} as const

export interface AdminAsset {
  readonly id: string
  /** Legacy-shaped public URL: `/api/blog/image/{encodeURIComponent(r2Key)}`. */
  readonly url: string
  readonly mime: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly alt: string | null
  readonly createdAt: number
  readonly inUse: boolean
}

export interface AdminAssetList {
  readonly rows: ReadonlyArray<AdminAsset>
  readonly next: string | null
}

/** Where an image is used: fixed place codes, and the posts by id and English title. */
export interface AssetUsage {
  readonly places: ReadonlyArray<string>
  readonly posts: ReadonlyArray<{ readonly id: string; readonly title: string }>
}

export interface UploadResult {
  readonly asset: AdminAsset
  /** The same bytes were uploaded before: the existing image is returned, nothing is stored again. */
  readonly duplicate: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// Authors (6c-2, programs/cms/authors.ts)

export const AUTHOR_LIMITS = { name: 80, bio: 600, jobTitle: 80, links: 8, link: 300 } as const

export interface AuthorTranslation {
  readonly bio: string | null
  readonly jobTitle: string | null
}

export interface AdminAuthor {
  readonly id: string
  readonly userId: string
  readonly userEmail: string
  readonly name: string
  readonly slug: string | null
  readonly avatar: AdminImage | null
  readonly sameAs: ReadonlyArray<string>
  /** Per locale; `en` falls back to the legacy `bio`/`role` columns. */
  readonly translations: Readonly<Partial<Record<Locale, AuthorTranslation>>>
  readonly posts: number
  /** Lock: `updatedAt` in seconds. */
  readonly revision: number
}

export interface AdminAuthorList {
  readonly rows: ReadonlyArray<AdminAuthor>
  /** Platform admins without an author profile (K13: every author is a real account). */
  readonly candidates: ReadonlyArray<{ readonly userId: string; readonly name: string; readonly email: string }>
}

export interface AuthorSaved {
  readonly id: string
  readonly revision: number
  readonly purgeTargets: number
  readonly purge: PurgeSummary | null
}
