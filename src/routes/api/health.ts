import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { healthResponse }] = await Promise.all([import('cloudflare:workers'), import('#/server/services/D1Health')])
        return healthResponse(env.vizcad_auth, request.headers.get('cf-ray'))
      },
    },
  },
})
