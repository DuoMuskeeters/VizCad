import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { ActivityPage } from '#/app/activity/ActivityPage'

export const Route = createFileRoute('/app/activity')({
  head: noindexHead('Activity'),
  component: ActivityPage,
})
