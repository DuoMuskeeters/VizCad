import { createFileRoute } from '@tanstack/react-router'

/** `/llms.txt` (docs/12 §6.6): English summary, product pages, the newest posts, the locale home pages. */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleSeoFile }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
        return handleSeoFile(request, env, { kind: 'llms' })
      },
    },
  },
})
