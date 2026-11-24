import { createFileRoute } from '@tanstack/react-router'

/** Identity surface: every method lands here; src/server/http/auth.ts answers 404 for anything not allowlisted. */
const identity = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env, waitUntil }, { handleIdentity }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry')])
  return handleIdentity(request, env, waitUntil)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: identity,
      POST: identity,
      PUT: identity,
      PATCH: identity,
      DELETE: identity,
      OPTIONS: identity,
      HEAD: identity,
    },
  },
})
