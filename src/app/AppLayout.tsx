import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { Activity, Files, FolderKanban, LogOut, Plus, Settings, Share2, Trash2, Users } from 'lucide-react'
import { AppShell, SidebarNav, SidebarNavItem, SidebarSection, SidebarUser } from '#/components/ui/AppShell'
import { Avatar } from '#/components/ui/Avatar'
import { Button } from '#/components/ui/Button'
import { MenuItem } from '#/components/ui/Menu'
import { InlineAlert } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { useToast } from '#/components/ui/Toast'
import { Tooltip } from '#/components/ui/Tooltip'
import { WorkspaceSwitcher, type WorkspaceOption } from '#/components/ui/WorkspaceSwitcher'
import { useI18n } from '#/i18n'
import { postAuth } from '#/auth/api'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'
import { failureKey } from './errors'
import { roleKey } from './roles'
import { UploadPill, UploadProvider } from './files/UploadProvider'
import { RequireSession, SessionProvider, useUser } from './session'
import { useWorkspace, useWorkspaceState, WorkspaceProvider } from './workspace'

/** Sidebar entry the role may not open: visible, inert, with the reason (docs/03 §1: never hidden). */
const DisabledNavItem = ({ icon, label, reason }: { icon: React.ReactNode; label: string; reason: string }) => (
  <Tooltip content={reason} side="right">
    <SidebarNavItem asChild icon={icon} className="cursor-not-allowed opacity-70 hover:bg-transparent hover:text-text-2">
      <button type="button" aria-disabled="true" onClick={(e) => e.preventDefault()}>
        {label}
        <span className="sr-only">{`. ${reason}`}</span>
      </button>
    </SidebarNavItem>
  </Tooltip>
)

const Frame = () => {
  const { t } = useI18n()
  const { state, switchTo } = useWorkspaceState()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // D20: only a brand-new sign-up lands in onboarding, once (the server keeps the mark), while it still has just the personal workspace.
  const ready = state.status === 'ready'
  const needsOnboarding = state.status === 'ready' && state.needsOnboarding
  const onlyPersonal = state.status === 'ready' && state.workspaces.length === 1 && state.workspaces[0]?.kind === 'personal'
  useEffect(() => {
    if (ready && onlyPersonal && needsOnboarding) void navigate({ to: '/onboarding' })
  }, [ready, onlyPersonal, needsOnboarding, navigate])

  if (state.status === 'loading')
    return (
      <div className="grid gap-4 p-8" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-40 w-full max-w-3xl" />
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="px-4 py-16">
        <InlineAlert title={t('app.error.loadTitle')} action={<Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>}>
          {t(failureKey(state.failure))}
        </InlineAlert>
      </div>
    )
  return (
    <ReadyFrame
      pathname={pathname}
      creating={creating}
      setCreating={setCreating}
      signingOut={signingOut}
      onSignOut={async () => {
        setSigningOut(true)
        await postAuth('/sign-out', {})
        void navigate({ to: '/sign-in', search: { next: undefined } })
      }}
      onCreated={() => void navigate({ to: '/app/team' })}
      onSwitch={async (id) => {
        const result = await switchTo(id)
        if (!result.ok) toast({ title: t(failureKey(result)), tone: 'danger' })
        else void navigate({ to: '/app' })
      }}
    />
  )
}

const ReadyFrame = ({
  pathname,
  creating,
  setCreating,
  signingOut,
  onSignOut,
  onSwitch,
  onCreated,
}: {
  pathname: string
  creating: boolean
  setCreating: (open: boolean) => void
  signingOut: boolean
  onSignOut: () => Promise<void>
  onSwitch: (id: string) => Promise<void>
  onCreated: () => void
}) => {
  const { t } = useI18n()
  const user = useUser()
  const { active, workspaces } = useWorkspace()
  const options: WorkspaceOption[] = workspaces.map((w) => ({
    id: w.id,
    name: w.kind === 'personal' ? user.name : w.name,
    subtitle: w.kind === 'personal' ? t('app.workspace.personal') : t(roleKey(w.role)),
    ...(w.role === 'guest' ? { guest: true } : {}),
  }))
  const manager = active.role === 'owner' || active.role === 'admin'
  const nav = (
    <>
      <WorkspaceSwitcher
        workspaces={options}
        value={active.id}
        onValueChange={(id) => void onSwitch(id)}
        memberLabel={t('app.workspace.yours')}
        guestLabel={t('app.workspace.guestOf')}
        guestBadge={t('app.role.guest')}
        footer={
          <MenuItem icon={<Plus />} onSelect={() => setCreating(true)}>
            {t('app.workspace.new')}
          </MenuItem>
        }
      />
      <SidebarNav aria-label={t('app.nav.label')} className="mt-2">
        <SidebarNavItem asChild icon={<FolderKanban />} current={pathname.startsWith('/app/projects')}>
          <Link to="/app/projects">{t('app.nav.projects')}</Link>
        </SidebarNavItem>
        <SidebarNavItem asChild icon={<Files />} current={pathname === '/app' || pathname === '/app/' || pathname.startsWith('/app/files')}>
          <Link to="/app">{t('app.nav.files')}</Link>
        </SidebarNavItem>
        <SidebarNavItem asChild icon={<Share2 />} current={pathname.startsWith('/app/shared')}>
          <Link to="/app/shared">{t('app.nav.shared')}</Link>
        </SidebarNavItem>
        <SidebarNavItem asChild icon={<Users />} current={pathname.startsWith('/app/team')}>
          <Link to="/app/team">{t('app.nav.team')}</Link>
        </SidebarNavItem>
        {manager ? (
          <SidebarNavItem asChild icon={<Activity />} current={pathname.startsWith('/app/activity')}>
            <Link to="/app/activity">{t('app.nav.activity')}</Link>
          </SidebarNavItem>
        ) : (
          <DisabledNavItem icon={<Activity />} label={t('app.nav.activity')} reason={t('nav.activityReason')} />
        )}
        <SidebarNavItem asChild icon={<Settings />} current={pathname.startsWith('/app/settings')}>
          <Link to="/app/settings">{t('app.nav.settings')}</Link>
        </SidebarNavItem>
      </SidebarNav>
      <SidebarSection>
        <SidebarNav aria-label={t('app.nav.other')}>
          <SidebarNavItem asChild icon={<Trash2 />} current={pathname.startsWith('/app/trash')}>
            <Link to="/app/trash">{t('app.nav.trash')}</Link>
          </SidebarNavItem>
        </SidebarNav>
        <SidebarUser name={user.name} email={user.email} />
        <Button variant="ghost" loading={signingOut} onClick={() => void onSignOut()} className="justify-start">
          <LogOut aria-hidden className="size-4.5" />
          {t('app.signOut')}
        </Button>
      </SidebarSection>
    </>
  )
  return (
    <UploadProvider>
      <AppShell
        menuLabel={t('app.nav.menu')}
        skipLabel={t('app.nav.skip')}
        sidebar={nav}
        mobileBar={
          <>
            <WorkspaceSwitcher
              variant="bar"
              workspaces={options}
              value={active.id}
              onValueChange={(id) => void onSwitch(id)}
              memberLabel={t('app.workspace.yours')}
              guestLabel={t('app.workspace.guestOf')}
              guestBadge={t('app.role.guest')}
              footer={
                <MenuItem icon={<Plus />} onSelect={() => setCreating(true)}>
                  {t('app.workspace.new')}
                </MenuItem>
              }
            />
            <UploadPill />
            <Avatar name={user.name} className="mr-1" />
          </>
        }
      >
        <Outlet />
      </AppShell>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} onCreated={onCreated} />
    </UploadProvider>
  )
}

export const AppLayout = () => (
  <SessionProvider>
    <RequireSession>
      <WorkspaceProvider>
        <Frame />
      </WorkspaceProvider>
    </RequireSession>
  </SessionProvider>
)
