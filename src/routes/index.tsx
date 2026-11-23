import { createFileRoute } from '@tanstack/react-router'

// Placeholder. The landing page is built last, from approved screens (docs/00-refactor-plan.md, Faz 2/6).
export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-3 px-4 py-16">
      <img src="/vizcad-logo-192.png" alt="" width={48} height={48} />
      <h1 className="text-2xl font-heading tracking-heading">VizCad</h1>
    </main>
  )
}
