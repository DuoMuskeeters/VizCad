import { createFileRoute } from '@tanstack/react-router'

/** robots.txt from code (src/server/cms/robots.ts): production opens marketing and blog, everything else disallows all. */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleSeoFile }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
        return handleSeoFile(request, env, { kind: 'robots' })
      },
    },
  },
})
