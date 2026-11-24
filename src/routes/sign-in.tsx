import { createFileRoute } from '@tanstack/react-router'
import { SignInPage, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/sign-in')({
  head: noindexHead('Sign in'),
  component: SignInPage,
})
