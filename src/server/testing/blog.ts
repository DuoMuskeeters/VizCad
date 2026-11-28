import { Effect } from 'effect'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { seedUser } from './fixtures'

const at = (seconds: number) => new Date(seconds * 1000)

export interface SeedPost {
  readonly id: string
  readonly slug: string
  readonly status?: 'draft' | 'published' | 'archived'
  readonly category?: string
  readonly tags?: ReadonlyArray<string>
  readonly featured?: boolean
  readonly publishedAt?: number
  readonly authorId?: string
  readonly coverImage?: string | null
  /** Write the `en` translation row (the cutover script's output). Default true. */
  readonly translated?: boolean
  readonly readTimeMin?: number
  readonly title?: string
}

/**
 * A legacy `posts` row and, unless `translated: false`, its `en` translation (what the cutover script writes).
 * The author user must exist (`seedAuthor`).
 */
export const seedPost = (post: SeedPost) =>
  Effect.gen(function* () {
    const db = yield* Db
    const published = post.publishedAt ?? 1_700_000_000
    const title = post.title ?? `Title ${post.slug}`
    yield* db.use((d) =>
      d.insert(schema.posts).values({
        id: post.id,
        slug: post.slug,
        title,
        excerpt: `Excerpt ${post.slug}`,
        content: `# ${title}\n\nBody.`,
        coverImage: post.coverImage ?? null,
        status: post.status ?? 'published',
        category: post.category ?? 'general',
        tags: post.tags === undefined ? null : [...post.tags],
        readTime: 3,
        featured: post.featured ?? false,
        authorId: post.authorId ?? 'ada',
        publishedAt: post.status === 'draft' ? null : at(published),
        createdAt: at(published - 10),
        updatedAt: at(published + 5),
      }),
    )
    if (post.translated === false) return
    yield* db.use((d) =>
      d.insert(schema.postTranslations).values({
        postId: post.id,
        locale: 'en',
        slug: post.slug,
        title,
        excerpt: `Excerpt ${post.slug}`,
        contentMd: `# ${title}\n\nBody.`,
        contentHtml: `<h2 id="x">${title}</h2><p>Body.</p>`,
        toc: [{ depth: 2, id: 'x', text: title }],
        readTimeMin: post.readTimeMin ?? 3,
        publishedAt: at(published),
        updatedAt: at(published + 5),
      }),
    )
  })

/** A user plus an author profile. `slug: null` = legacy author without a page yet. */
export const seedAuthor = (userId: string, options: { readonly slug?: string | null; readonly socialLinks?: Record<string, string> } = {}) =>
  Effect.gen(function* () {
    yield* seedUser(userId)
    const db = yield* Db
    yield* db.use((d) =>
      d.insert(schema.authorProfiles).values({
        id: `author-${userId}`,
        userId,
        name: `${userId.toUpperCase()} Writer`,
        bio: 'Writes about CAD.',
        role: 'Engineer',
        avatarUrl: null,
        socialLinks: options.socialLinks ?? null,
        slug: options.slug === undefined ? userId : options.slug,
        createdAt: at(1_600_000_000),
        updatedAt: at(1_600_000_000),
      }),
    )
  })
