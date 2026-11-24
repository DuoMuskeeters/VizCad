import { createFileRoute } from '@tanstack/react-router'
import { SignUpPage, noindexHead } from '#/auth/pages'
import { safeNext } from '#/app/nav'

export const Route = createFileRoute('/sign-up')({
  head: noindexHead('Sign up'),
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search['next']) }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { next } = Route.useSearch()
  return <SignUpPage next={next} />
}
