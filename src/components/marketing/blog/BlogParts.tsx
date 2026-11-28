import type { ReactNode } from 'react'
import type { Locale } from '#/i18n/locales'
import type { AuthorRef, ImageRef, PostCard } from '#/shared/blogTypes'
import { blogLocales, paths } from '#/shared/marketingRoutes'

/**
 * Public blog building blocks (docs/03 §2.17: readable lines ≤ 75 characters, author box, related posts). Mobile
 * first: designed at 320–430 px, one column, every link a ≥ 44 px target. Plain anchors (full page loads, served from
 * the edge cache) and no client state: the pages read fine without JavaScript (D4).
 *
 * Types come from shared/blogTypes.ts (type-only), so no server code reaches the client.
 */

/** Dates in UTC, so the server render and hydration agree whatever the visitor's zone. */
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' })
export const formatDate = (seconds: number) => dateFormat.format(new Date(seconds * 1000))
export const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString()

/** Two initials (first and last word). Local, so blog pages do not load the app's Radix avatar. */
export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] ?? '?'}${words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''}`.toUpperCase()
}

export const absoluteUrl = (origin: string, url: string) => (url.startsWith('/') ? `${origin}${url}` : url)

/** `3 min read` and friends, in one place. */
export const readTime = (minutes: number) => `${minutes} min read`

export function PostMeta({ post }: { post: Pick<PostCard, 'publishedAt' | 'readTimeMin'> }) {
  return (
    <p className="text-sm text-text-3">
      <time dateTime={isoDate(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
      <span aria-hidden> · </span>
      {readTime(post.readTimeMin)}
    </p>
  )
}

/** A cover with its stored size when known (no layout shift), else a fixed 1200:630 box. */
export function Cover({ image, priority = false, className = '' }: { image: ImageRef; priority?: boolean; className?: string }) {
  const sized = image.width !== null && image.height !== null
  return (
    <img
      src={image.url}
      alt={image.alt}
      {...(sized ? { width: image.width ?? undefined, height: image.height ?? undefined } : { width: 1200, height: 630 })}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      className={`aspect-[1200/630] w-full rounded-lg border border-line bg-surface object-cover ${className}`}
    />
  )
}

export function AuthorAvatar({ author, size = 'md' }: { author: Pick<AuthorRef, 'name' | 'avatar'>; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-16 text-lg' : 'size-9 text-sm'
  if (author.avatar !== null) {
    return <img src={author.avatar.url} alt="" width={size === 'lg' ? 64 : 36} height={size === 'lg' ? 64 : 36} loading="lazy" className={`${box} shrink-0 rounded-full object-cover`} />
  }
  return (
    <span aria-hidden className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-medium text-text`}>
      {initials(author.name)}
    </span>
  )
}

/**
 * One post in a list: cover, title (the whole card is not a link, the title is; ≥ 44 px), excerpt, meta. `priority`
 * for the first card of a page: its cover is the LCP element, so it loads eagerly and first.
 */
export function PostCardView({ post, locale, headingLevel = 2, priority = false }: { post: PostCard; locale: Locale; headingLevel?: 2 | 3; priority?: boolean }) {
  const href = paths.post(locale, post.slug)
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <article className="flex flex-col gap-3">
      {post.cover !== null && (
        <a href={href} tabIndex={-1} aria-hidden>
          <Cover image={post.cover} priority={priority} />
        </a>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-accent">{post.category}</p>
        <Heading className="text-xl font-heading tracking-heading text-text">
          <a href={href} className="-my-2 inline-block py-2 hover:underline">
            {post.title}
          </a>
        </Heading>
        <p className="line-clamp-3 text-md text-text-2">{post.excerpt}</p>
        <PostMeta post={post} />
      </div>
    </article>
  )
}

export function BlogHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex max-w-[40rem] flex-col gap-2">
      <h1 className="text-3xl font-heading tracking-heading text-text">{title}</h1>
      {description !== undefined && <p className="text-lg text-text-2">{description}</p>}
      {children}
    </header>
  )
}

/** Previous / next for paginated lists. Links are real URLs (`/blog`, `/blog/page/2`), each ≥ 44 px. */
export function Pagination({ locale, page, pages }: { locale: Locale; page: number; pages: number }) {
  if (pages <= 1) return null
  const link = 'inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-text hover:bg-hover'
  return (
    <nav aria-label="Pages" className="mt-12 flex items-center justify-between gap-3">
      {page > 1 ? (
        <a href={paths.blogList(locale, page - 1)} rel="prev" className={link}>
          Newer posts
        </a>
      ) : (
        <span />
      )}
      <span className="text-sm text-text-3">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <a href={paths.blogList(locale, page + 1)} rel="next" className={link}>
          Older posts
        </a>
      ) : (
        <span />
      )}
    </nav>
  )
}

/** The blog list a message links to: this locale's, or `en` where the locale has no blog (`/tr/blog` is itself a 404). */
export const blogHomePath = (locale: Locale): string => paths.blogList(blogLocales.includes(locale) ? locale : 'en')

/** System messages inside the marketing frame (404, 410, 500), docs/03 §2.19, in the page's language (en for the blog). */
export function BlogMessage({ title, body, locale }: { title: string; body: string; locale: Locale }) {
  return (
    <div className="flex min-h-[50dvh] max-w-[40rem] flex-col justify-center gap-3">
      <h1 className="text-2xl font-heading tracking-heading text-text">{title}</h1>
      <p className="text-lg text-text-2">{body}</p>
      <p>
        <a href={blogHomePath(locale)} className="-mx-1 inline-flex min-h-11 items-center px-1 font-medium text-accent hover:underline">
          Go to the blog
        </a>
      </p>
    </div>
  )
}
