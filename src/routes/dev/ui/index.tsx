import { createFileRoute } from '@tanstack/react-router'
import { UiShowcase } from '#/components/dev/UiShowcase'
import { requireDevEnvironment } from '#/components/dev/guard'

// Home of the component set (docs/03-design.md). Static samples only. Never indexed. 404 in production.
export const Route = createFileRoute('/dev/ui/')({
  // Server-rendered on purpose: the guard runs on the server, so production answers 404 (with ssr: false it would only 404 in the browser).
  beforeLoad: () => {
    requireDevEnvironment()
  },
  head: () => ({ meta: [{ title: 'UI · VizCad' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: UiShowcase,
})
