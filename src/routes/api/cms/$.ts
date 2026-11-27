import { createFileRoute } from '@tanstack/react-router'

/** Admin CMS API: every method lands here; src/server/http/cms.ts answers 404 for unknown operations and 403 for non-POST. */
const cms = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env }, { handleCms }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
  return handleCms(request, env)
}

export const Route = createFileRoute('/api/cms/$')({
  server: {
    handlers: {
      GET: cms,
      POST: cms,
      PUT: cms,
      PATCH: cms,
      DELETE: cms,
      OPTIONS: cms,
      HEAD: cms,
    },
  },
})
