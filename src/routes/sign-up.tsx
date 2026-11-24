import { createFileRoute } from '@tanstack/react-router'
import { SignUpPage, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/sign-up')({
  head: noindexHead('Sign up'),
  component: SignUpPage,
})
