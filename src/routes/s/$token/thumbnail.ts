import { createFileRoute } from '@tanstack/react-router'

/** `GET /s/{token}/thumbnail`: the shared file's thumbnail (docs/09 §3.1). */
const thumbnail = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleShare }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.share')])
  return handleShare(request, env, waitUntil)
}

export const Route = createFileRoute('/s/$token/thumbnail')({
  server: { handlers: { GET: thumbnail } },
})
