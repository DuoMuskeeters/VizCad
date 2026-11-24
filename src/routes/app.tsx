import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { AppLayout } from '#/app/AppLayout'

export const Route = createFileRoute('/app')({
  head: noindexHead('VizCad'),
  component: AppLayout,
})
