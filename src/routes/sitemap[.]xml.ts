import { createFileRoute } from '@tanstack/react-router'

/** The sitemap index (docs/12 §6.4). The legacy `/sitemap.xml` address Search Console knows stays the entry point. */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleSeoFile }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
        return handleSeoFile(request, env, { kind: 'sitemapIndex' })
      },
    },
  },
})
