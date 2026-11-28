import { createFileRoute } from '@tanstack/react-router'

/** Legacy blog image URL (docs/12 rule 5): `/api/blog/image/{encodeURIComponent(r2Key)}`, `blog/` keys only. */
const image = async ({ request }: { request: Request }) => {
  // Server-only modules are loaded here so they never reach the client bundle.
  const [{ env }, { handleBlogImage }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
  return handleBlogImage(request, env)
}

export const Route = createFileRoute('/api/blog/image/$key')({
  server: { handlers: { GET: image, HEAD: image } },
})
