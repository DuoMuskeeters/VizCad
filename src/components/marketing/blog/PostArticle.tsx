import type { Locale } from '#/i18n/locales'
import type { AuthorDetail, PostView } from '#/shared/blogTypes'
import { paths } from '#/shared/marketingRoutes'
import { AuthorAvatar, Cover, formatDate, isoDate, PostCardView, readTime } from './BlogParts'

/**
 * The post page body. `contentHtml` was rendered and made safe when the post was saved (server/cms/markdown.ts), so it
 * is printed as is; the public request renders no markdown (docs/12 §4.3, §7.5). Line length ≤ 75 characters
 * (`max-w-[40rem]` at 17 px), contents list before the text, author box and related posts after it.
 */
export function PostArticle({ post, locale }: { post: PostView; locale: Locale }) {
  const updated = post.updatedAt - post.publishedAt > 86_400
  return (
    <article className="mx-auto flex max-w-[40rem] flex-col gap-8">
      <nav aria-label="Breadcrumb" className="text-sm text-text-3">
        <ol className="flex flex-wrap items-center gap-x-1">
          <li>
            <a href={paths.page(locale, 'landing')} className="-mx-1 inline-flex min-h-11 items-center px-1 hover:text-text hover:underline">
              Home
            </a>
          </li>
          <li aria-hidden>/</li>
          <li>
            <a href={paths.blogList(locale)} className="-mx-1 inline-flex min-h-11 items-center px-1 hover:text-text hover:underline">
              Blog
            </a>
          </li>
        </ol>
      </nav>

      <header className="-mt-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-accent">{post.category}</p>
        <h1 className="text-3xl font-heading tracking-heading text-balance text-text">{post.title}</h1>
        <p className="text-lg text-text-2">{post.excerpt}</p>
        <div className="flex items-center gap-3">
          {post.authorDetail !== null && <AuthorAvatar author={post.authorDetail} />}
          <div className="flex min-w-0 flex-col text-sm">
            {post.authorDetail !== null && <AuthorName author={post.authorDetail} locale={locale} />}
            <p className="text-text-3">
              <time dateTime={isoDate(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
              <span aria-hidden> · </span>
              {readTime(post.readTimeMin)}
              {updated && (
                <>
                  <span aria-hidden> · </span>
                  Updated <time dateTime={isoDate(post.updatedAt)}>{formatDate(post.updatedAt)}</time>
                </>
              )}
            </p>
          </div>
        </div>
      </header>

      {post.cover !== null && <Cover image={post.cover} priority />}

      {post.showToc && (
        <details className="rounded-lg border border-line bg-surface open:pb-2" open>
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-text">Contents</summary>
          <ol className="flex flex-col px-4">
            {post.toc.map((item) => (
              <li key={item.id} className={item.depth === 3 ? 'pl-4' : ''}>
                <a href={`#${item.id}`} className="inline-flex min-h-11 items-center py-1 text-md text-text-2 hover:text-text hover:underline">
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* Stored, sanitized HTML (see the module comment). */}
      <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

      {post.tags.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <li key={tag} className="rounded-md bg-surface px-2.5 py-1 text-sm text-text-2">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {post.authorDetail !== null && <AuthorBox author={post.authorDetail} locale={locale} />}

      {post.related.length > 0 && (
        <section aria-labelledby="related" className="flex flex-col gap-6 border-t border-line pt-8">
          <h2 id="related" className="text-xl font-heading tracking-heading text-text">
            Related posts
          </h2>
          <div className="grid gap-8">
            {post.related.map((related) => (
              <PostCardView key={related.slug} post={related} locale={locale} headingLevel={3} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

function AuthorName({ author, locale }: { author: AuthorDetail; locale: Locale }) {
  if (author.slug === null) return <span className="font-medium text-text">{author.name}</span>
  return (
    <a href={paths.author(locale, author.slug)} rel="author" className="-my-3 inline-flex min-h-11 items-center font-medium text-text hover:underline">
      {author.name}
    </a>
  )
}

/** The author box under the post (E-E-A-T, D5): who wrote it, their role, a link to their page. */
export function AuthorBox({ author, locale }: { author: AuthorDetail; locale: Locale }) {
  return (
    <aside aria-label="About the author" className="flex gap-4 rounded-lg border border-line p-4">
      <AuthorAvatar author={author} size="lg" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-md">
          <AuthorName author={author} locale={locale} />
        </p>
        {author.jobTitle !== null && <p className="text-sm text-text-3">{author.jobTitle}</p>}
        {author.bio !== null && <p className="text-md text-text-2">{author.bio}</p>}
      </div>
    </aside>
  )
}
