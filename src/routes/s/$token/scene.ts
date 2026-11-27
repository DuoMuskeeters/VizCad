import { createFileRoute } from '@tanstack/react-router'

/** `GET /s/{token}/scene`: the scene record of the shared model (docs/11 §3.1, Faz 5d), read-only, no `updatedBy`. No session; the token and the password proof are the credential. */
const scene = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleShare }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.share')])
  return handleShare(request, env, waitUntil)
}

export const Route = createFileRoute('/s/$token/scene')({
  server: { handlers: { GET: scene } },
})
