import { notFound, useRouterState } from '@tanstack/react-router'
import type { Locale } from '#/i18n/locales'
import type { PostList } from '#/shared/blogTypes'
import { blogLocales, localeOfPath, paths } from '#/shared/marketingRoutes'
import { blog, breadcrumbList } from '#/shared/seo/jsonld'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { BlogHeader, BlogMessage, Pagination, PostCardView } from '#/components/marketing/blog/BlogParts'
import { loadBlogList } from '#/components/marketing/blog/data'
import { BLOG_DESCRIPTION, BLOG_NAME, blogHead, blogListAlternates, blogTitle, organizationNode } from '#/components/marketing/blog/head'

/** Shared by `/blog` and `/blog/page/$page` (the `-` prefix keeps this file out of the route tree). */
export const listLoader = async (locale: Locale, page: number) => {
  const result = await loadBlogList({ data: { locale, page } })
  if (!result.ok && result.status === 404) throw notFound()
  return result
}

export const listHead = (result: Awaited<ReturnType<typeof listLoader>> | undefined, locale: Locale) => {
  if (result?.ok !== true) return { meta: [{ title: BLOG_NAME }] }
  const siteUrl = new URL(result.siteOrigin)
  const { page, cards } = result.data
  const url = (path: string) => `${siteUrl.origin}${path}`
  const blogUrl = url(paths.blogList(locale))
  return blogHead({
    siteUrl,
    locale,
    alternates: blogListAlternates(page, blogLocales),
    title: page <= 1 ? BLOG_NAME : blogTitle(`Page ${page}`),
    description: BLOG_DESCRIPTION,
    jsonLd: [
      organizationNode(siteUrl),
      blog({
        siteUrl,
        blogUrl,
        url: url(paths.blogList(locale, page)),
        name: BLOG_NAME,
        description: BLOG_DESCRIPTION,
        locale,
        posts: cards.map((card) => ({ url: url(paths.post(locale, card.slug)), headline: card.title })),
      }),
      breadcrumbList([
        { name: 'Home', url: url(paths.page(locale, 'landing')) },
        { name: 'Blog', url: blogUrl },
      ]),
    ],
  })
}

export function BlogList({ result, locale }: { result: { ok: true; data: PostList } | { ok: false; status: number }; locale: Locale }) {
  if (!result.ok) {
    return (
      <MarketingShell>
        <BlogMessage locale={locale} title="Something broke" body="We could not load the blog. Try again in a moment." />
      </MarketingShell>
    )
  }
  const { cards, page, pages } = result.data
  return (
    <MarketingShell alternates={blogListAlternates(page, blogLocales)}>
      <BlogHeader title={page <= 1 ? 'Blog' : `Blog · page ${page}`} description={BLOG_DESCRIPTION}>
        <p>
          <a href={paths.rss(locale)} className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm font-medium text-accent hover:underline">
            RSS feed
          </a>
        </p>
      </BlogHeader>
      {cards.length === 0 ? (
        <p className="mt-10 text-lg text-text-2">No posts yet.</p>
      ) : (
        <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <PostCardView key={card.slug} post={card} locale={locale} priority={index === 0} />
          ))}
        </div>
      )}
      <Pagination locale={locale} page={page} pages={pages} />
    </MarketingShell>
  )
}

/** 404 inside the marketing frame; the locale comes from the URL (notFoundComponent has no loader data). */
export function BlogNotFound() {
  const locale = localeOfPath(useRouterState({ select: (state) => state.location.pathname }))
  return (
    <MarketingShell>
      <BlogMessage locale={locale} title="This page does not exist" body="It may have been moved or removed." />
    </MarketingShell>
  )
}
