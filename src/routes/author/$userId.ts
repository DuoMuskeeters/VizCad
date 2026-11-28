import { createFileRoute } from '@tanstack/react-router'

/** Legacy `/author/{userId}` (dead link in old JSON-LD) → `/authors/{slug}` or `/blog` (docs/12 §6.9). */
const redirect = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env }, { handleLegacyAuthor }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
  return handleLegacyAuthor(request, env)
}

export const Route = createFileRoute('/author/$userId')({
  server: { handlers: { GET: redirect, HEAD: redirect } },
})
