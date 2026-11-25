import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { ProjectsPage } from '#/app/projects/ProjectsPage'

export const Route = createFileRoute('/app/projects/')({
  head: noindexHead('Projects'),
  component: ProjectsPage,
})
