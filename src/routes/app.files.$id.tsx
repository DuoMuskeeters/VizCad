import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { FileDetailPage } from '#/app/files/FileDetailPage'

export const Route = createFileRoute('/app/files/$id')({
  head: noindexHead('VizCad'),
  validateSearch: (search: Record<string, unknown>): { share?: boolean } => (search['share'] === true || search['share'] === 'true' ? { share: true } : {}),
  component: FileDetailPage,
})
