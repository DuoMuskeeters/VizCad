import { createFileRoute } from '@tanstack/react-router'
import { SignedInPlaceholder, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/app')({
  head: noindexHead('VizCad'),
  component: SignedInPlaceholder,
})
