import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { TeamPage } from '#/app/team/TeamPage'

export const Route = createFileRoute('/app/team')({
  head: noindexHead('Team'),
  component: TeamPage,
})
