import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { SharedPage } from '#/app/shared/SharedPage'

export const Route = createFileRoute('/app/shared')({
  head: noindexHead('Shared'),
  component: SharedPage,
})
