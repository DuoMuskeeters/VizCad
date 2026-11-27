import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { FileDetailPage, validateFileSearch } from '#/app/files/FileDetailPage'

export const Route = createFileRoute('/app/files/$id')({
  head: noindexHead('VizCad'),
  validateSearch: validateFileSearch,
  component: FileDetailPage,
})
