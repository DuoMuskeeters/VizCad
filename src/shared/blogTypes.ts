/**
 * Serializable shapes of the public blog (docs/12 §3.1), shared by the server program (programs/cms/blog.ts) and the
 * page components. Types only: importing this file brings no code into either bundle. Dates are Unix seconds.
 */
import type { Locale } from '#/i18n/locales'

export interface ImageRef {
  /** Relative (`/api/blog/image/...`) or absolute https URL. */
  readonly url: string
  readonly width: number | null
  readonly height: number | null
  readonly alt: string
}

export interface AuthorRef {
  readonly name: string
  /** Null: the author has no page yet (no slug). */
  readonly slug: string | null
  readonly avatar: ImageRef | null
}

export interface PostCard {
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly category: string
  /** Unix seconds. */
  readonly publishedAt: number
  readonly updatedAt: number
  readonly readTimeMin: number
  readonly featured: boolean
  readonly cover: ImageRef | null
  readonly author: AuthorRef | null
}

export interface TocItem {
  readonly depth: number
  readonly id: string
  readonly text: string
}

export interface PostView extends PostCard {
  readonly contentHtml: string
  readonly toc: ReadonlyArray<TocItem>
  readonly showToc: boolean
  readonly tags: ReadonlyArray<string>
  readonly metaTitle: string | null
  readonly metaDescription: string | null
  readonly keywords: ReadonlyArray<string>
  /** Open Graph image (§6.8): the translation's OG asset, else the cover. */
  readonly ogImage: ImageRef | null
  readonly authorDetail: AuthorDetail | null
  readonly related: ReadonlyArray<PostCard>
  /** Live locale → this post's path there. Always has `en`. */
  readonly alternates: Readonly<Partial<Record<Locale, string>>> & { readonly en: string }
}

export interface AuthorDetail extends AuthorRef {
  readonly bio: string | null
  readonly jobTitle: string | null
  /** Official profiles (https only), from `socialLinks`. */
  readonly sameAs: ReadonlyArray<string>
}

export interface PostList {
  readonly page: number
  readonly pages: number
  readonly total: number
  readonly cards: ReadonlyArray<PostCard>
}

export interface AuthorPage {
  readonly author: AuthorDetail & { readonly slug: string }
  readonly posts: ReadonlyArray<PostCard>
}

/** `getPublicPost` result: the post, or a 301 to its current URL (an old slug, §6.9). */
export type PostResult = { readonly kind: 'post'; readonly post: PostView } | { readonly kind: 'redirect'; readonly path: string }
