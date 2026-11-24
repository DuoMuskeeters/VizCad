import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { OnboardingPage } from '#/app/onboarding/OnboardingPage'

export const Route = createFileRoute('/onboarding')({
  // Client-rendered (CPU budget): the server answers with the shell only. Children of /app inherit this.
  ssr: false,
  head: noindexHead('Welcome'),
  component: OnboardingPage,
})
