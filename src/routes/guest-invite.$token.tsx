import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { InvitePage } from '#/app/invite/InvitePage'

export const Route = createFileRoute('/guest-invite/$token')({
  // Client-rendered (CPU budget): the server answers with the shell only. Children of /app inherit this.
  ssr: false,
  head: noindexHead('Invitation'),
  component: GuestInviteRoute,
})

function GuestInviteRoute() {
  const { token } = Route.useParams()
  return <InvitePage invite={{ kind: 'guest', token }} />
}
