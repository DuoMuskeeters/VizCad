import { createFileRoute } from '@tanstack/react-router'
import { AuthSkeleton } from '#/auth/AuthSkeleton'
import { EmailVerifiedPage, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/email-verified')({
  // Client-rendered (CPU budget, Free plan): the server sends the shell and a skeleton; head (noindex, title) is still rendered.
  ssr: false,
  pendingComponent: AuthSkeleton,
  head: noindexHead('Email verified'),
  component: EmailVerifiedPage,
})
