import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { SettingsPage } from '#/app/settings/SettingsPage'

export const Route = createFileRoute('/app/settings')({
  head: noindexHead('Settings'),
  component: SettingsPage,
})
