import { createFileRoute } from '@tanstack/react-router'

/** `GET /api/files/{fileId}/content?v=`: the file's bytes for a member, through the Worker (docs/09 §3.1). */
const content = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env, waitUntil }, { handleFiles }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.files')])
  return handleFiles(request, env, waitUntil)
}

export const Route = createFileRoute('/api/files/$fileId/content')({
  server: { handlers: { GET: content } },
})
