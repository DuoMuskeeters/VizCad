import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { requireDevEnvironment } from '#/components/dev/guard'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { NO_STORE_HEADER } from '#/shared/marketingRoutes'

// Temporary CPU-gate page (docs/12 §7.5): a marketing shell and 3 D1 queries in one batch, served through the edge
// cache like a marketing page so the miss `cpuTime` can be measured on staging. 404 in production. Deleted in 6b.
const loadProbe = createServerFn({ method: 'GET' }).handler(async () => {
  // Server-only modules load here, so they never reach the client bundle.
  const [{ env }, { loadCmsProbe }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
  return loadCmsProbe(env, 'en')
})

export const Route = createFileRoute('/dev/cms-probe')({
  // Server-rendered on purpose: the guard runs on the server, so production answers 404.
  beforeLoad: () => {
    requireDevEnvironment()
  },
  loader: () => loadProbe(),
  // A failed read must not be cached for a day.
  headers: ({ loaderData }) => (loaderData?.ok === true ? {} : { [NO_STORE_HEADER]: '1', 'cache-control': 'no-store' }),
  head: () => ({ meta: [{ title: 'CMS probe · VizCad' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: CmsProbe,
})

function CmsProbe() {
  const result = Route.useLoaderData()
  return (
    <MarketingShell>
      <h1 className="font-heading text-2xl tracking-heading">CMS probe</h1>
      {result.ok ? (
        <>
          <p className="mt-2 text-sm text-text-2">
            {result.data.posts.length} posts · {result.data.texts.length} texts · landing SEO {result.data.seo === null ? 'none' : result.data.seo.live ? 'live' : 'draft'}
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {result.data.posts.map((post) => (
              <li key={post.slug} className="rounded-lg border border-line p-4">
                <h2 className="font-medium">{post.title}</h2>
                <p className="mt-1 text-sm text-text-2">{post.excerpt}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-2">The database did not answer.</p>
      )}
    </MarketingShell>
  )
}
