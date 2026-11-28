import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { ArrowLeft, FileText } from 'lucide-react'
import { AppShell, SidebarNav, SidebarNavItem, SidebarSection } from '#/components/ui/AppShell'
import { Button } from '#/components/ui/Button'
import { Logo } from '#/components/ui/Logo'
import { InlineAlert } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { AdminLink } from './AdminLink'
import { cmsCall } from './api'
import { adminPaths } from './routes'
import { useAdminText } from './text'

type Gate = { readonly status: 'loading' } | { readonly status: 'anonymous' } | { readonly status: 'denied' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly purgeConfigured: boolean }

const AdminCtx = createContext<{ readonly purgeConfigured: boolean } | null>(null)

/** Whether cache purging is configured (the red banner; publishing is refused without it, docs/12 rule 2). */
export const useAdminInfo = () => {
  const ctx = use(AdminCtx)
  if (!ctx) throw new Error('useAdminInfo must be used inside <AdminLayout>')
  return ctx
}

/**
 * `/admin/*` (docs/12 §9): client rendered, noindex, desktop first and complete on mobile (D14). The first call doubles
 * as the gate: 401 asks to sign in, 403 says the area is for platform admins (`canManageContent`, server side).
 */
export const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { text } = useAdminText()
  const { pathname } = useLocation()
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setGate({ status: 'loading' })
    void cmsCall<{ configured: boolean }>('listPurges', { limit: 1 }).then((result) => {
      if (cancelled) return
      if (result.ok) setGate({ status: 'ready', purgeConfigured: result.data.configured })
      else if (result.status === 401) setGate({ status: 'anonymous' })
      else if (result.status === 403 && result.error === 'PermissionDenied') setGate({ status: 'denied' })
      else setGate({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (gate.status !== 'ready')
    return (
      <main id="main" className="mx-auto grid w-full max-w-130 gap-4 px-4 py-16">
        <Logo className="text-[26px]" />
        {gate.status === 'loading' ? (
          <div className="grid gap-3" aria-busy="true">
            <span className="sr-only">{text.gate.loading}</span>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : gate.status === 'anonymous' ? (
          <InlineAlert title={text.gate.signIn} action={<Button asChild variant="primary"><a href={`/sign-in?next=${encodeURIComponent(pathname)}`}>{text.gate.signInAction}</a></Button>} />
        ) : gate.status === 'denied' ? (
          <InlineAlert title={text.gate.denied} action={<Button asChild><a href="/app">{text.nav.backToApp}</a></Button>} />
        ) : (
          <InlineAlert title={text.gate.error} action={<Button onClick={retry}>{text.gate.retry}</Button>} />
        )}
      </main>
    )

  const sidebar = (
    <>
      <SidebarNav aria-label={text.nav.label} className="mt-2">
        <p className="px-2 pb-1 pt-2 text-xs font-medium text-text-3">{text.nav.label}</p>
        <SidebarNavItem asChild icon={<FileText />} current={pathname.startsWith('/admin/cms/posts')}>
          <AdminLink href={adminPaths.posts()}>{text.nav.posts}</AdminLink>
        </SidebarNavItem>
      </SidebarNav>
      <SidebarSection>
        <SidebarNav aria-label={text.nav.backToApp}>
          <SidebarNavItem asChild icon={<ArrowLeft />}>
            <a href="/app">{text.nav.backToApp}</a>
          </SidebarNavItem>
        </SidebarNav>
      </SidebarSection>
    </>
  )

  return (
    <AdminCtx value={{ purgeConfigured: gate.purgeConfigured }}>
      <AppShell sidebar={sidebar} mobileBar={<span className="truncate px-1 font-medium text-text">{text.nav.label}</span>} menuLabel={text.nav.menu} skipLabel={text.nav.skip}>
        {gate.purgeConfigured ? null : (
          <p role="status" className="mb-4 rounded-md border border-danger/40 bg-danger-soft px-3 py-2.5 text-md font-medium text-danger">
            {text.gate.purgeOff}
          </p>
        )}
        {children}
      </AppShell>
    </AdminCtx>
  )
}
