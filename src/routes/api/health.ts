import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleHealth }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry')])
        return handleHealth(request, env)
      },
    },
  },
})
