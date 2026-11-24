import { createFileRoute } from '@tanstack/react-router'
import { EmailVerifiedPage, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/email-verified')({
  head: noindexHead('Email verified'),
  component: EmailVerifiedPage,
})
