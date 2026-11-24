import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { OnboardingPage } from '#/app/onboarding/OnboardingPage'

export const Route = createFileRoute('/onboarding')({
  head: noindexHead('Welcome'),
  component: OnboardingPage,
})
