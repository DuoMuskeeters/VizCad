import { createFileRoute, redirect } from '@tanstack/react-router'
import { pageHeaders } from '#/components/marketing/blog/data'
import { paths } from '#/shared/marketingRoutes'
import { BlogList, BlogNotFound, listHead, listLoader } from './-list'

/**
 * `/blog/page/$page`. Only `[1-9][0-9]*` matches (the marketing cache space, marketingRoutes.ts); `/blog/page/1` is a
 * 301 to `/blog` (one URL per page); a page past the end is 404. Paginated lists are not in the sitemap (§6.4).
 */
export const Route = createFileRoute('/{-$locale}/blog/page/$page')({
  params: {
    parse: (raw) => (/^[1-9][0-9]{0,4}$/.test(raw.page) ? { page: Number(raw.page) } : false),
    stringify: (params) => ({ page: String(params.page) }),
  },
  loader: ({ params }) => {
    const locale = params.locale ?? 'en'
    if (params.page === 1) throw redirect({ href: paths.blogList(locale), statusCode: 301 })
    return listLoader(locale, params.page)
  },
  staleTime: Infinity,
  headers: ({ loaderData }) => pageHeaders(loaderData),
  head: ({ loaderData, params }) => listHead(loaderData, params.locale ?? 'en'),
  notFoundComponent: BlogNotFound,
  component: () => <BlogList result={Route.useLoaderData()} locale={Route.useParams().locale ?? 'en'} />,
})
