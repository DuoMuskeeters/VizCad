import { createFileRoute } from '@tanstack/react-router'
import { FilesDemo } from '#/components/dev/FilesDemo'
import { requireDevEnvironment } from '#/components/dev/guard'

// Static copy of the "Tüm dosyalar" screen (design/mockups/v2/01-dosyalar.html). No data, nothing is saved. Never indexed. 404 in production.
export const Route = createFileRoute('/dev/ui/shell')({
  // Server-rendered on purpose: the guard runs on the server, so production answers 404 (with ssr: false it would only 404 in the browser).
  beforeLoad: () => {
    requireDevEnvironment()
  },
  head: () => ({ meta: [{ title: 'Kabuk · UI · VizCad' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: FilesDemo,
})
