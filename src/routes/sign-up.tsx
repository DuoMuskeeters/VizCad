import { createFileRoute } from '@tanstack/react-router'
import { AuthSkeleton } from '#/auth/AuthSkeleton'
import { SignUpPage, noindexHead } from '#/auth/pages'
import { safeNext } from '#/app/nav'

export const Route = createFileRoute('/sign-up')({
  // Client-rendered (CPU budget, Free plan): the server sends the shell and a skeleton; head (noindex, title) is still rendered.
  ssr: false,
  pendingComponent: AuthSkeleton,
  head: noindexHead('Sign up'),
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search['next']) }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { next } = Route.useSearch()
  return <SignUpPage next={next} />
}
