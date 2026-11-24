import { createFileRoute } from '@tanstack/react-router'
import { SignInPage, noindexHead } from '#/auth/pages'
import { safeNext } from '#/app/nav'

export const Route = createFileRoute('/sign-in')({
  head: noindexHead('Sign in'),
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search['next']) }),
  component: SignInRoute,
})

function SignInRoute() {
  const { next } = Route.useSearch()
  return <SignInPage next={next} />
}
