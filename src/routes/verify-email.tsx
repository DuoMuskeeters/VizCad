import { createFileRoute } from '@tanstack/react-router'
import { AuthSkeleton } from '#/auth/AuthSkeleton'
import { VerifyEmailPage, noindexHead } from '#/auth/pages'
import { optionalString } from '#/auth/search'

export const Route = createFileRoute('/verify-email')({
  // Client-rendered (CPU budget, Free plan): the server sends the shell and a skeleton; head (noindex, title) is still rendered.
  ssr: false,
  pendingComponent: AuthSkeleton,
  head: noindexHead('Verify email'),
  validateSearch: (search: Record<string, unknown>) => ({ error: optionalString(search['error']) }),
  component: VerifyRoute,
})

function VerifyRoute() {
  const { error } = Route.useSearch()
  return <VerifyEmailPage error={error} />
}
