import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { TrashPage } from '#/app/trash/TrashPage'

export const Route = createFileRoute('/app/trash')({
  head: noindexHead('Trash'),
  component: TrashPage,
})
