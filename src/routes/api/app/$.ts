import { createFileRoute } from '@tanstack/react-router'

/** Product API: every method lands here; src/server/http/app.ts answers 404 for unknown operations and 403 for non-POST. */
const app = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env, waitUntil }, { handleApp }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry')])
  return handleApp(request, env, waitUntil)
}

export const Route = createFileRoute('/api/app/$')({
  server: {
    handlers: {
      GET: app,
      POST: app,
      PUT: app,
      PATCH: app,
      DELETE: app,
      OPTIONS: app,
      HEAD: app,
    },
  },
})
