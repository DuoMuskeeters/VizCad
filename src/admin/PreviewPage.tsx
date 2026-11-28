import { useEffect, useState } from 'react'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { blogTitle } from '#/components/marketing/blog/head'
import { PostArticle } from '#/components/marketing/blog/PostArticle'
import { Button } from '#/components/ui/Button'
import { InlineAlert } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import type { Locale } from '#/i18n/locales'
import type { PreviewResult } from '#/shared/cmsTypes'
import { AdminLink } from './AdminLink'
import { cmsCall, type CmsFailure } from './api'
import { adminPaths } from './routes'
import { failureText } from './failures'
import { useAdminText } from './text'

type State = { readonly status: 'loading' } | { readonly status: 'error'; readonly failure: CmsFailure } | { readonly status: 'ready'; readonly preview: PreviewResult }

/**
 * `/admin/cms/preview/post/$id/$locale` (docs/12 §7.2): the public post template with the draft's data, rendered by the
 * server's renderer (`previewDraft`), under a "Preview · not published" band. Platform admins only (the call is the gate).
 */
export const PreviewPage = ({ postId, locale }: { postId: string; locale: Locale }) => {
  const { text } = useAdminText()
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    void cmsCall<PreviewResult>('previewDraft', { postId, locale }).then((result) => {
      if (!cancelled) setState(result.ok ? { status: 'ready', preview: result.data } : { status: 'error', failure: result })
    })
    return () => {
      cancelled = true
    }
  }, [postId, locale])
  const title = state.status === 'ready' ? state.preview.post.title : ''
  useEffect(() => {
    if (title === '') return
    const previous = document.title
    document.title = `${text.preview.band} · ${blogTitle(title)}`
    return () => {
      document.title = previous
    }
  }, [title, text])

  return (
    <>
      <div role="status" className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn-soft px-4 py-2 text-md font-medium text-warn-text">
        <span>{state.status === 'ready' && state.preview.source === 'live' ? text.preview.fromLive : text.preview.band}</span>
        <Button asChild variant="ghost">
          <AdminLink href={adminPaths.post(postId, locale)}>{text.preview.back}</AdminLink>
        </Button>
      </div>
      {/* The public page's own shell, so the preview reads exactly like the post will (docs/12 §7.2). */}
      <MarketingShell>
        <div lang={locale}>
        {state.status === 'loading' ? (
          <div className="mx-auto grid max-w-[40rem] gap-4" aria-busy="true">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : state.status === 'error' ? (
          <div className="mx-auto max-w-[40rem]">
            <InlineAlert title={state.failure.status === 401 ? text.gate.signIn : state.failure.status === 403 ? text.gate.denied : failureText(text, state.failure)} />
          </div>
        ) : (
          <PostArticle post={state.preview.post} locale={locale} />
        )}
        </div>
      </MarketingShell>
    </>
  )
}
