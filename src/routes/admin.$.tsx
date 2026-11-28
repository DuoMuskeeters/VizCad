import { createFileRoute } from '@tanstack/react-router'
import { AdminApp } from '#/admin/AdminApp'
import { noindexHead } from '#/auth/pages'

/**
 * `/admin/*`, the admin CMS (docs/12 §9). One splat route that routes inside its own lazy chunk (admin/routes.ts):
 * every route registered here would sit in the main bundle that every marketing page loads. Client rendered (the
 * server sends the shell only) and never indexed.
 */
export const Route = createFileRoute('/admin/$')({
  ssr: false,
  head: noindexHead('Admin'),
  component: AdminApp,
})
