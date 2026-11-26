import { createFileRoute } from '@tanstack/react-router'

/** `GET /api/files/{fileId}/model`: the file's bytes for the 3D viewer (docs/11 §2.4): audited as a preview, not a download. */
const model = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env, waitUntil }, { handleFiles }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.files')])
  return handleFiles(request, env, waitUntil)
}

export const Route = createFileRoute('/api/files/$fileId/model')({
  server: { handlers: { GET: model } },
})
