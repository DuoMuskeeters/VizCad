import { createContext, use, useState, type ComponentProps, type ReactNode } from 'react'
import { Dialog as D, Slot } from 'radix-ui'
import { Menu as MenuIcon, Search } from 'lucide-react'
import { cx, fastTransition } from './cx'
import { IconButton } from './Button'
import { Logo } from './Logo'
import { Meter } from './Meter'
import { Avatar } from './Avatar'

type ShellContext = { openNav: () => void }
const Ctx = createContext<ShellContext | null>(null)
export const useAppShell = (): ShellContext => {
  const shell = use(Ctx)
  if (!shell) throw new Error('useAppShell must be used inside <AppShell>')
  return shell
}

export type AppShellProps = {
  /** Sidebar body: <WorkspaceSwitcher>, <SidebarNav>, <SidebarStorage>… Shown in the sidebar (≥ 900px) and in the drawer (below). */
  sidebar: ReactNode
  /** Mobile top bar content after the menu button: compact workspace switcher, search, avatar. */
  mobileBar: ReactNode
  /** Floating action on mobile (e.g. Yükle). Hide it while selecting. */
  mobileAction?: ReactNode
  menuLabel?: string
  skipLabel?: string
  children: ReactNode
}

const sidebarClass = 'flex flex-col gap-1 bg-surface p-3'

/**
 * Desktop: fixed sidebar + content. Below 900px: top bar, the sidebar becomes a drawer opened from the menu button.
 * Content is `<main id="main">` with a skip link. Pure layout: no data, no routing.
 */
export const AppShell = ({ sidebar, mobileBar, mobileAction, menuLabel = 'Menü', skipLabel = 'İçeriğe geç', children }: AppShellProps) => {
  const [drawer, setDrawer] = useState(false)
  return (
    <Ctx value={{ openNav: () => setDrawer(true) }}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-bg px-3 py-2 font-medium text-text focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        {skipLabel}
      </a>
      <div className="min-h-dvh app:grid app:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
        <aside className={cx(sidebarClass, 'sticky top-0 hidden h-dvh overflow-y-auto border-r border-line app:flex')}>
          <Logo className="mx-2 mb-2 mt-1 text-[26px]" />
          {sidebar}
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line bg-bg px-2 app:hidden">
            <IconButton label={menuLabel} onClick={() => setDrawer(true)}>
              <MenuIcon aria-hidden className="size-5" />
            </IconButton>
            {mobileBar}
          </header>
          <main id="main" tabIndex={-1} className="px-4 pb-26 pt-5 outline-none app:px-10 app:pb-16 app:pt-7">
            <div className="mx-auto w-full max-w-content">{children}</div>
          </main>
        </div>
      </div>

      {mobileAction ? <div className="fixed bottom-4 right-4 z-10 app:hidden">{mobileAction}</div> : null}

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay data-motion="overlay" className="fixed inset-0 z-40 bg-scrim app:hidden" />
          <D.Content
            data-motion="drawer"
            aria-describedby={undefined}
            // Any link inside closes the drawer, so navigating never leaves it covering the next page.
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('a')) setDrawer(false)
            }}
            className={cx(sidebarClass, 'fixed inset-y-0 left-0 z-50 w-[min(320px,86vw)] overflow-y-auto pt-4 shadow-pop app:hidden')}
          >
            <D.Title className="sr-only">{menuLabel}</D.Title>
            <Logo className="mx-2 mb-2 text-[26px]" />
            {sidebar}
          </D.Content>
        </D.Portal>
      </D.Root>
    </Ctx>
  )
}

export const SidebarNav = ({ className, ...rest }: ComponentProps<'nav'>) => (
  <nav className={cx('grid gap-px', className)} {...rest} />
)

export const SidebarSection = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('mt-auto grid gap-1', className)}>{children}</div>
)

export type SidebarNavItemProps = ComponentProps<'a'> & {
  icon: ReactNode
  current?: boolean
  count?: number | string
  /** Style the child (a router `Link`) instead of rendering an <a>. The child holds icon, label and count itself then. */
  asChild?: boolean
}

export const SidebarNavItem = ({ icon, current = false, count, asChild = false, className, children, ...rest }: SidebarNavItemProps) => {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      {...(current ? { 'aria-current': 'page' as const } : {})}
      className={cx(
        'flex h-11 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-md font-medium text-text-2 app:h-9 app:text-base',
        'hover:bg-hover hover:text-text',
        current && 'border-line bg-bg text-text hover:bg-bg [&_svg]:text-accent',
        fastTransition,
        className,
      )}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          <span aria-hidden className="grid shrink-0 [&>svg]:size-4.5">
            {icon}
          </span>
          {children}
          {count === undefined ? null : <span className="ml-auto text-xs text-text-3">{count}</span>}
        </>
      )}
    </Comp>
  )
}

export const SidebarSearchButton = ({
  label = 'Ara',
  shortcut = '⌘K',
  className,
  ...rest
}: ComponentProps<'button'> & { label?: string; shortcut?: string }) => (
  <button
    type="button"
    className={cx(
      'my-1 mb-2 flex h-11 items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-md text-text-3 hover:text-text-2 app:h-9 app:text-base',
      fastTransition,
      className,
    )}
    {...rest}
  >
    <Search aria-hidden className="size-4.5" />
    {label}
    <kbd className="ml-auto hidden rounded-[4px] border border-line px-1.5 font-sans text-xs leading-4.5 text-text-3 app:inline">{shortcut}</kbd>
  </button>
)

export type SidebarStorageProps = { label: string; valueText: string; used: number; max: number }

export const SidebarStorage = ({ label, valueText, used, max }: SidebarStorageProps) => (
  <div className="grid gap-2 px-2.5 py-3 text-sm text-text-2">
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span>{valueText}</span>
    </div>
    <Meter value={used} max={max} label={label} valueText={valueText} />
  </div>
)

export const SidebarUser = ({ name, email }: { name: string; email: string }) => (
  <div className="-mx-1 mt-1 flex items-center gap-2.5 border-t border-line px-2 pb-1 pt-3">
    <Avatar name={name} decorative />
    <div className="min-w-0 text-sm leading-snug">
      <div className="truncate font-medium">{name}</div>
      <div className="truncate text-text-3">{email}</div>
    </div>
  </div>
)
