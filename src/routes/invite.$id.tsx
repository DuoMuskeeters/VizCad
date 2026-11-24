import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { InvitePage } from '#/app/invite/InvitePage'

export const Route = createFileRoute('/invite/$id')({
  head: noindexHead('Invitation'),
  component: InviteRoute,
})

function InviteRoute() {
  const { id } = Route.useParams()
  return <InvitePage invite={{ kind: 'member', id }} />
}
