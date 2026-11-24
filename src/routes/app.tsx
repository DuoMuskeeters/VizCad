import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { AppLayout } from '#/app/AppLayout'

export const Route = createFileRoute('/app')({
  // Client-rendered (CPU budget): the server answers with the shell only. Children of /app inherit this.
  ssr: false,
  head: noindexHead('VizCad'),
  component: AppLayout,
})
