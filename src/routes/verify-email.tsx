import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailPage, noindexHead } from '#/auth/pages'
import { optionalString } from '#/auth/search'

export const Route = createFileRoute('/verify-email')({
  head: noindexHead('Verify email'),
  validateSearch: (search: Record<string, unknown>) => ({ error: optionalString(search['error']) }),
  component: VerifyRoute,
})

function VerifyRoute() {
  const { error } = Route.useSearch()
  return <VerifyEmailPage error={error} />
}
