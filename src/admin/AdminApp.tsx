import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'
import { EmptyState } from '#/components/ui/EmptyState'
import { AdminLayout } from './AdminLayout'
import { AssetsPage } from './AssetsPage'
import { AuthorsPage } from './AuthorsPage'
import { CachePage } from './CachePage'
import { PostEditor } from './PostEditor'
import { PostsPage } from './PostsPage'
import { PreviewPage } from './PreviewPage'
import { adminPaths, localeOfSearch, parseAdminPath } from './routes'
import { useAdminText } from './text'

/** The admin's screens behind the `/admin/$` splat (admin/routes.ts). The preview sits outside the shell (docs/12 §7.2). */
export const AdminApp = () => {
  const { _splat } = useParams({ from: '/admin/$' })
  const { searchStr } = useLocation()
  const navigate = useNavigate()
  const route = parseAdminPath(_splat ?? '')
  useEffect(() => {
    if (route.screen === 'home') void navigate({ href: adminPaths.posts(), replace: true })
  }, [route.screen, navigate])

  if (route.screen === 'preview') return <PreviewPage postId={route.postId} locale={route.locale} />
  return (
    <AdminLayout>
      {route.screen === 'posts' ? (
        <PostsPage />
      ) : route.screen === 'post' ? (
        <PostEditor postId={route.postId} locale={localeOfSearch(searchStr)} />
      ) : route.screen === 'authors' ? (
        <AuthorsPage />
      ) : route.screen === 'assets' ? (
        <AssetsPage />
      ) : route.screen === 'cache' ? (
        <CachePage />
      ) : route.screen === 'missing' ? (
        <Missing />
      ) : null}
    </AdminLayout>
  )
}

const Missing = () => {
  const { text } = useAdminText()
  return <EmptyState icon={<FileQuestion />} title={text.nav.missing} />
}
