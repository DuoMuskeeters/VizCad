import { createFileRoute } from '@tanstack/react-router'

/**
 * `POST /api/files/{fileId}/derivative/start|complete|failed`: the GLB derivative's presigned upload (docs/11 §2.3). Any
 * other step is the handler's 404.
 */
const derivative = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env, waitUntil }, { handleFiles }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.files')])
  return handleFiles(request, env, waitUntil)
}

export const Route = createFileRoute('/api/files/$fileId/derivative/$step')({
  server: { handlers: { POST: derivative } },
})
