import { createFileRoute, notFound } from '@tanstack/react-router'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { absoluteUrl, AuthorAvatar, BlogMessage, PostCardView } from '#/components/marketing/blog/BlogParts'
import { loadAuthor, pageHeaders } from '#/components/marketing/blog/data'
import { blogHead, blogTitle, organizationNode } from '#/components/marketing/blog/head'
import { blogLocales, paths } from '#/shared/marketingRoutes'
import { sameAlternates } from '#/shared/seo/head'
import { breadcrumbList, profilePage } from '#/shared/seo/jsonld'
import { BlogNotFound } from '../blog/-list'

/** `/authors/$slug` (D5, E-E-A-T): who writes, their role and their posts. Only authors with a public post exist. */
export const Route = createFileRoute('/{-$locale}/authors/$slug')({
  loader: async ({ params }) => {
    const result = await loadAuthor({ data: { locale: params.locale ?? 'en', slug: params.slug } })
    if (!result.ok && result.status === 404) throw notFound()
    return result
  },
  staleTime: Infinity,
  headers: ({ loaderData }) => pageHeaders(loaderData),
  head: ({ loaderData, params }) => {
    const locale = params.locale ?? 'en'
    if (loaderData?.ok !== true) return { meta: [{ title: 'VizCad Blog' }] }
    const { author } = loaderData.data
    const siteUrl = new URL(loaderData.siteOrigin)
    const origin = siteUrl.origin
    const url = `${origin}${paths.author(locale, author.slug)}`
    const description = author.bio ?? `Posts by ${author.name} on the VizCad Blog.`
    return blogHead({
      siteUrl,
      locale,
      alternates: sameAlternates(`/authors/${author.slug}`, blogLocales),
      title: blogTitle(author.name),
      description,
      jsonLd: [
        organizationNode(siteUrl),
        profilePage({
          url,
          locale,
          person: {
            name: author.name,
            url,
            jobTitle: author.jobTitle,
            image: author.avatar === null ? null : absoluteUrl(origin, author.avatar.url),
            description: author.bio,
            sameAs: author.sameAs,
          },
        }),
        breadcrumbList([
          { name: 'Home', url: `${origin}${paths.page(locale, 'landing')}` },
          { name: 'Blog', url: `${origin}${paths.blogList(locale)}` },
          { name: author.name, url },
        ]),
      ],
    })
  },
  notFoundComponent: BlogNotFound,
  component: AuthorRoute,
})

function AuthorRoute() {
  const result = Route.useLoaderData()
  const locale = Route.useParams().locale ?? 'en'
  if (!result.ok) {
    return (
      <MarketingShell>
        <BlogMessage locale={locale} title="Something broke" body="We could not load this page. Try again in a moment." />
      </MarketingShell>
    )
  }
  const { author, posts } = result.data
  return (
    <MarketingShell alternates={sameAlternates(`/authors/${author.slug}`, blogLocales)}>
      <header className="flex max-w-[40rem] flex-col gap-4 sm:flex-row sm:items-center">
        <AuthorAvatar author={author} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-heading tracking-heading text-text">{author.name}</h1>
          {author.jobTitle !== null && <p className="text-md text-text-3">{author.jobTitle}</p>}
        </div>
      </header>
      {author.bio !== null && <p className="mt-4 max-w-[40rem] text-lg text-text-2">{author.bio}</p>}
      {author.sameAs.length > 0 && (
        <ul aria-label="Profiles" className="mt-2 flex flex-wrap gap-x-4">
          {author.sameAs.map((href) => (
            <li key={href}>
              <a href={href} rel="me noopener" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
                {new URL(href).hostname.replace(/^www\./, '')}
              </a>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-12 text-xl font-heading tracking-heading text-text">Posts</h2>
      <div className="mt-6 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCardView key={post.slug} post={post} locale={locale} headingLevel={3} />
        ))}
      </div>
    </MarketingShell>
  )
}
