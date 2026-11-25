import { createFileRoute } from '@tanstack/react-router'

/** `GET` serves the thumbnail; `POST` stores one (PNG or WebP, at most 1 MiB; docs/09 §3.1). */
const thumbnail = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleFiles }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.files')])
  return handleFiles(request, env, waitUntil)
}

export const Route = createFileRoute('/api/files/$fileId/thumbnail')({
  server: { handlers: { GET: thumbnail, POST: thumbnail } },
})
