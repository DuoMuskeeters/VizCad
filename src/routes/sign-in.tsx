import { createFileRoute } from '@tanstack/react-router'
import { AuthSkeleton } from '#/auth/AuthSkeleton'
import { SignInPage, noindexHead } from '#/auth/pages'
import { safeNext } from '#/app/nav'

export const Route = createFileRoute('/sign-in')({
  // Client-rendered (CPU budget, Free plan): the server sends the shell and a skeleton; head (noindex, title) is still rendered.
  ssr: false,
  pendingComponent: AuthSkeleton,
  head: noindexHead('Sign in'),
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search['next']) }),
  component: SignInRoute,
})

function SignInRoute() {
  const { next } = Route.useSearch()
  return <SignInPage next={next} />
}
