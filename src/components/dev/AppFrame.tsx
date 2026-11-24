import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Activity, FolderKanban, Files, Plus, Search, Settings, Share2, Trash2, Upload, Users } from 'lucide-react'
import { AppShell, SidebarNav, SidebarNavItem, SidebarSearchButton, SidebarSection, SidebarStorage, SidebarUser } from '#/components/ui/AppShell'
import { WorkspaceSwitcher } from '#/components/ui/WorkspaceSwitcher'
import { MenuItem } from '#/components/ui/Menu'
import { Avatar } from '#/components/ui/Avatar'
import { Button, IconButton } from '#/components/ui/Button'
import { workspaces } from './sample'

/** Sidebar + mobile bar from the mockups with static data (no routing: every item is a no-op). */
export const AppFrame = ({ current, fab = true, children }: { current: string; fab?: boolean; children: ReactNode }) => {
  const [workspace, setWorkspace] = useState('dm')
  const item = (id: string, label: string, icon: ReactNode) => (
    <SidebarNavItem asChild icon={icon} current={current === id}>
      <Link to="/dev/ui/shell">{label}</Link>
    </SidebarNavItem>
  )
  return (
    <AppShell
      sidebar={
        <>
          <WorkspaceSwitcher
            workspaces={workspaces}
            value={workspace}
            onValueChange={setWorkspace}
            footer={
              <>
                <MenuItem icon={<Plus />}>Yeni workspace oluştur</MenuItem>
                <MenuItem icon={<Settings />}>Workspace ayarları</MenuItem>
              </>
            }
          />
          <SidebarSearchButton />
          <SidebarNav aria-label="Ana menü">
            {item('projects', 'Projeler', <FolderKanban />)}
            {item('files', 'Tüm dosyalar', <Files />)}
            {item('shared', 'Paylaşılanlar', <Share2 />)}
            {item('team', 'Ekip', <Users />)}
            {item('activity', 'Aktivite', <Activity />)}
            {item('settings', 'Ayarlar', <Settings />)}
          </SidebarNav>
          <SidebarSection>
            <SidebarNav aria-label="Diğer">{item('trash', 'Çöp kutusu', <Trash2 />)}</SidebarNav>
            <SidebarStorage label="Depolama" valueText="153 MB / 5 GB" used={153} max={5120} />
            <SidebarUser name="Ayşe Yılmaz" email="ayse@demirmakina.com" />
          </SidebarSection>
        </>
      }
      mobileBar={
        <>
          <WorkspaceSwitcher variant="bar" workspaces={workspaces} value={workspace} onValueChange={setWorkspace} />
          <IconButton label="Ara">
            <Search aria-hidden className="size-5" />
          </IconButton>
          <Avatar name="Ayşe Yılmaz" tone="accent" className="mr-1" />
        </>
      }
      {...(fab
        ? {
            mobileAction: (
              <Button variant="primary" className="h-13 rounded-full px-5 shadow-pop">
                <Upload aria-hidden className="size-4.5" />
                Yükle
              </Button>
            ),
          }
        : {})}
    >
      {children}
    </AppShell>
  )
}
