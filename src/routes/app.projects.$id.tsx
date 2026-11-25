import { createFileRoute } from '@tanstack/react-router'
import { noindexHead } from '#/auth/pages'
import { ProjectPage } from '#/app/projects/ProjectPage'

export const Route = createFileRoute('/app/projects/$id')({
  head: noindexHead('Project'),
  component: ProjectPage,
})
