import { createFileRoute } from '@tanstack/react-router'

// Home of the component set once the design is approved (docs/03-design.md). Never indexed.
export const Route = createFileRoute('/dev/ui')({
  head: () => ({ meta: [{ title: 'UI · VizCad' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: DevUi,
})

function DevUi() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-xl font-semibold">UI</h1>
    </main>
  )
}
