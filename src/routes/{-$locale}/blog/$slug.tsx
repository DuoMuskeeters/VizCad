import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { absoluteUrl, BlogMessage } from '#/components/marketing/blog/BlogParts'
import { loadPost, pageHeaders } from '#/components/marketing/blog/data'
import { blogHead, blogTitle, organizationNode } from '#/components/marketing/blog/head'
import { PostArticle } from '#/components/marketing/blog/PostArticle'
import { paths } from '#/shared/marketingRoutes'
import { blogPosting, breadcrumbList, person } from '#/shared/seo/jsonld'
import { BlogNotFound } from './-list'

/**
 * `/blog/$slug`: one post from `post_translations` (stored HTML). An old slug is a 301 to the current one (stored in
 * the edge cache like the page), an archived post 410, anything else missing 404 (docs/12 §2, §6.9).
 * `/blog/rss.xml` and `/blog/page/*` are their own routes and match first.
 */
export const Route = createFileRoute('/{-$locale}/blog/$slug')({
  loader: async ({ params }) => {
    const locale = params.locale ?? 'en'
    const result = await loadPost({ data: { locale, slug: params.slug } })
    if (!result.ok && result.status === 404) throw notFound()
    if (result.ok && result.data.kind === 'redirect') throw redirect({ href: result.data.path, statusCode: 301 })
    return result
  },
  staleTime: Infinity,
  headers: ({ loaderData }) => pageHeaders(loaderData),
  head: ({ loaderData, params }) => {
    const locale = params.locale ?? 'en'
    if (loaderData?.ok !== true || loaderData.data.kind !== 'post') return { meta: [{ title: loaderData?.ok === false && loaderData.status === 410 ? 'Post removed · VizCad Blog' : 'VizCad Blog' }] }
    const post = loaderData.data.post
    const siteUrl = new URL(loaderData.siteOrigin)
    const origin = siteUrl.origin
    const url = `${origin}${post.alternates[locale] ?? paths.post(locale, post.slug)}`
    const blogUrl = `${origin}${paths.blogList(locale)}`
    const author = post.authorDetail
    const authorUrl = author?.slug ? `${origin}${paths.author(locale, author.slug)}` : undefined
    const image = post.ogImage === null ? undefined : absoluteUrl(origin, post.ogImage.url)
    const description = post.metaDescription ?? post.excerpt
    return blogHead({
      siteUrl,
      locale,
      alternates: post.alternates,
      title: blogTitle(post.metaTitle ?? post.title),
      description,
      ...(post.ogImage === null || image === undefined
        ? {}
        : {
            image: {
              url: image,
              alt: post.ogImage.alt || post.title,
              ...(post.ogImage.width !== null && post.ogImage.height !== null ? { width: post.ogImage.width, height: post.ogImage.height } : {}),
            },
          }),
      article: {
        publishedTime: new Date(post.publishedAt * 1000).toISOString(),
        modifiedTime: new Date(post.updatedAt * 1000).toISOString(),
        ...(authorUrl === undefined ? {} : { authorUrl }),
        section: post.category,
      },
      jsonLd: [
        organizationNode(siteUrl),
        blogPosting({
          siteUrl,
          url,
          blogUrl,
          headline: post.title,
          description,
          ...(image === undefined ? {} : { image }),
          datePublished: new Date(post.publishedAt * 1000).toISOString(),
          dateModified: new Date(post.updatedAt * 1000).toISOString(),
          locale,
          ...(author === null ? {} : { author: { name: author.name, ...(authorUrl === undefined ? {} : { url: authorUrl }) } }),
          section: post.category,
          keywords: post.keywords,
        }),
        ...(author === null
          ? []
          : [
              {
                '@context': 'https://schema.org',
                ...person({
                  name: author.name,
                  ...(authorUrl === undefined ? {} : { url: authorUrl }),
                  jobTitle: author.jobTitle,
                  image: author.avatar === null ? null : absoluteUrl(origin, author.avatar.url),
                  sameAs: author.sameAs,
                }),
              },
            ]),
        breadcrumbList([
          { name: 'Home', url: `${origin}${paths.page(locale, 'landing')}` },
          { name: 'Blog', url: blogUrl },
          { name: post.title, url },
        ]),
      ],
    })
  },
  notFoundComponent: BlogNotFound,
  component: PostRoute,
})

function PostRoute() {
  const result = Route.useLoaderData()
  const locale = Route.useParams().locale ?? 'en'
  if (!result.ok) {
    return (
      <MarketingShell>
        {result.status === 410 ? (
          <BlogMessage locale={locale} title="This post was removed" body="It is no longer published." />
        ) : (
          <BlogMessage locale={locale} title="Something broke" body="We could not load this post. Try again in a moment." />
        )}
      </MarketingShell>
    )
  }
  if (result.data.kind !== 'post') return null
  const post = result.data.post
  return (
    <MarketingShell alternates={post.alternates}>
      <PostArticle post={post} locale={locale} />
    </MarketingShell>
  )
}
