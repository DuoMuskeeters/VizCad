import { createFileRoute } from '@tanstack/react-router'
import { ForgotPasswordPage, noindexHead } from '#/auth/pages'

export const Route = createFileRoute('/forgot-password')({
  head: noindexHead('Reset password'),
  component: ForgotPasswordPage,
})
