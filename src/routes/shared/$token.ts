import { createFileRoute } from '@tanstack/react-router'

/** `/shared/<token>` of the old app redirects to `/s/<token>` (src/server/http/legacyRedirect.ts). */
const redirect = async ({ request }: { request: Request }) => {
  const { legacySharedRedirect } = await import('#/server/http/legacyRedirect')
  return legacySharedRedirect(request)
}

export const Route = createFileRoute('/shared/$token')({
  server: { handlers: { GET: redirect, HEAD: redirect } },
})
