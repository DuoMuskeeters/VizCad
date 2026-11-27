import { createFileRoute } from '@tanstack/react-router'

/** `/blog/rss.xml` (docs/12 §6.7). Locales outside blogLocales answer 404 in the program (never cached). */
export const Route = createFileRoute('/{-$locale}/blog/rss.xml')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleSeoFile }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
        return handleSeoFile(request, env, { kind: 'rss', locale: params.locale ?? 'en' })
      },
    },
  },
})
