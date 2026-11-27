import { createFileRoute } from '@tanstack/react-router'

/** `GET` reads the scene record, `POST` writes it (docs/11 §3; `preview` to read, `edit` to write). */
const scene = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleFiles }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.files')])
  return handleFiles(request, env, waitUntil)
}

export const Route = createFileRoute('/api/files/$fileId/scene')({
  server: { handlers: { GET: scene, POST: scene } },
})
