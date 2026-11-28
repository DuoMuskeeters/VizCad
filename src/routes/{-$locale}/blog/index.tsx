import { createFileRoute } from '@tanstack/react-router'
import { pageHeaders } from '#/components/marketing/blog/data'
import { BlogList, BlogNotFound, listHead, listLoader } from './-list'

/** `/blog` (and `/{locale}/blog` once the locale is in blogLocales; 404 until then, D9/K14). SSR + edge cache. */
export const Route = createFileRoute('/{-$locale}/blog/')({
  loader: ({ params }) => listLoader(params.locale ?? 'en', 1),
  staleTime: Infinity,
  headers: ({ loaderData }) => pageHeaders(loaderData),
  head: ({ loaderData, params }) => listHead(loaderData, params.locale ?? 'en'),
  notFoundComponent: BlogNotFound,
  component: () => <BlogList result={Route.useLoaderData()} locale={Route.useParams().locale ?? 'en'} />,
})
