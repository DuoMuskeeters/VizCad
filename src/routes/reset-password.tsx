import { createFileRoute } from '@tanstack/react-router'
import { AuthSkeleton } from '#/auth/AuthSkeleton'
import { ResetPasswordPage, noindexHead } from '#/auth/pages'
import { optionalString } from '#/auth/search'

export const Route = createFileRoute('/reset-password')({
  // Client-rendered (CPU budget, Free plan): the server sends the shell and a skeleton; head (noindex, title) is still rendered.
  ssr: false,
  pendingComponent: AuthSkeleton,
  head: noindexHead('New password'),
  validateSearch: (search: Record<string, unknown>) => ({ token: optionalString(search['token']), error: optionalString(search['error']) }),
  component: ResetRoute,
})

function ResetRoute() {
  const { token, error } = Route.useSearch()
  return <ResetPasswordPage token={token} error={error} />
}
