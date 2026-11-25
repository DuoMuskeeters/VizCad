import { createFileRoute } from '@tanstack/react-router'
import { SharePage } from '#/app/share/SharePage'

export const Route = createFileRoute('/s/$token/')({
  // Client-rendered (CPU budget): the server answers with the shell only; the data comes from POST /api/s/resolve.
  ssr: false,
  // The token is in the URL: never indexed, never sent on as a referrer (docs/09 §4.3).
  head: () => ({
    meta: [
      { title: 'VizCad' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  headers: () => ({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }),
  component: SharedLinkRoute,
})

function SharedLinkRoute() {
  const { token } = Route.useParams()
  return <SharePage token={token} />
}
