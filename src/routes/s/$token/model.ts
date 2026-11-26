import { createFileRoute } from '@tanstack/react-router'

/** `GET /s/{token}/model`: the shared 3D viewer's bytes (docs/11 §2.4), audited as a preview. No session; the token and the password proof are the credential. */
const model = async ({ request }: { request: Request }) => {
  const [{ env, waitUntil }, { handleShare }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.share')])
  return handleShare(request, env, waitUntil)
}

export const Route = createFileRoute('/s/$token/model')({
  server: { handlers: { GET: model } },
})
