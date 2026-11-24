import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { InvitePage } from '#/app/invite/InvitePage'

export const Route = createFileRoute('/guest-invite/$token')({
  head: noindexHead('Invitation'),
  component: GuestInviteRoute,
})

function GuestInviteRoute() {
  const { token } = Route.useParams()
  return <InvitePage invite={{ kind: 'guest', token }} />
}
