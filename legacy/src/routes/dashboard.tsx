// app/routes/index.tsx (veya app/routes/dashboard.tsx)
import { createFileRoute } from '@tanstack/react-router'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardPage,
})

function DashboardPage() {
  return <DashboardLayout />
}