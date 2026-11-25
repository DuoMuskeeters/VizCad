import { createFileRoute } from '@tanstack/react-router'

/** `GET /s/{token}/content`: a download link's bytes (docs/09 §3.1). No session; the token and the password proof are the credential. */
const content = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleShare }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.share')])
  return handleShare(request, env, waitUntil)
}

export const Route = createFileRoute('/s/$token/content')({
  server: { handlers: { GET: content } },
})
