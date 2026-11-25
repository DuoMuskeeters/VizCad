import { createFileRoute } from '@tanstack/react-router'

/** Link page data: `POST /api/s/resolve` and `POST /api/s/password` (docs/09 §4). Every method lands here; src/server/http/share.ts answers 404 or 403 for the rest. */
const share = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleShare }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.share')])
  return handleShare(request, env, waitUntil)
}

export const Route = createFileRoute('/api/s/$')({
  server: { handlers: { GET: share, POST: share, PUT: share, PATCH: share, DELETE: share, OPTIONS: share, HEAD: share } },
})
