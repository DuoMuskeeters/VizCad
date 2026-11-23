import type { ReactNode } from 'react'
import { ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cx, fastTransition } from './cx'
import { Badge } from './Badge'
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from './Menu'
import { avatarTones, initials, type AvatarTone } from './Avatar'

export type WorkspaceMarkProps = { name: string; tone?: AvatarTone; size?: 'sm' | 'md'; className?: string }

/** Two-letter square for a workspace. */
export const WorkspaceMark = ({ name, tone = 'ink', size = 'md', className }: WorkspaceMarkProps) => (
  <span
    aria-hidden
    className={cx(
      'grid shrink-0 place-items-center rounded-sm font-bold text-bg',
      size === 'md' ? 'size-7 text-xs' : 'size-6.5 text-[11px]',
      avatarTones[tone],
      className,
    )}
  >
    {initials(name)}
  </span>
)

export type WorkspaceOption = {
  id: string
  name: string
  /** "Yönetici · 12 üye", "Kişisel", "1 proje" … */
  subtitle: string
  tone?: AvatarTone
  /** Guests are listed in their own group with a badge. */
  guest?: boolean
}

export type WorkspaceSwitcherProps = {
  workspaces: readonly WorkspaceOption[]
  value: string
  onValueChange: (id: string) => void
  /** `sidebar`: name + subtitle (≥ 900px). `bar`: name only, for the mobile top bar. */
  variant?: 'sidebar' | 'bar'
  memberLabel?: string
  guestLabel?: string
  guestBadge?: string
  /** Extra items under a separator (create workspace, settings): <MenuItem>s. */
  footer?: ReactNode
}

/** Static presentation: the list comes in as props; no data loading and no routing. */
export const WorkspaceSwitcher = ({
  workspaces,
  value,
  onValueChange,
  variant = 'sidebar',
  memberLabel = 'Workspace’lerin',
  guestLabel = 'Misafir olduğun',
  guestBadge = 'Misafir',
  footer,
}: WorkspaceSwitcherProps) => {
  const current = workspaces.find((w) => w.id === value) ?? workspaces[0]
  const members = workspaces.filter((w) => !w.guest)
  const guests = workspaces.filter((w) => w.guest)
  if (!current) return null

  const item = (w: WorkspaceOption) => (
    <MenuRadioItem key={w.id} value={w.id} icon={<WorkspaceMark name={w.name} size="sm" {...(w.tone ? { tone: w.tone } : {})} />} description={w.subtitle}>
      <span className="flex items-center gap-2">
        {w.name}
        {w.guest ? <Badge tone="guest">{guestBadge}</Badge> : null}
      </span>
    </MenuRadioItem>
  )

  return (
    <Menu>
      <MenuTrigger
        className={cx(
          'flex min-w-0 items-center gap-2.5 rounded-md p-2 text-left hover:bg-hover',
          variant === 'sidebar' ? 'w-full' : 'min-h-11 flex-1',
          fastTransition,
        )}
      >
        <WorkspaceMark name={current.name} {...(current.tone ? { tone: current.tone } : {})} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-semibold">{current.name}</span>
          {variant === 'sidebar' ? <span className="block truncate text-xs text-text-3">{current.subtitle}</span> : null}
        </span>
        {variant === 'sidebar' ? (
          <ChevronsUpDown aria-hidden className="size-4.5 shrink-0 text-text-3" />
        ) : (
          <ChevronDown aria-hidden className="size-4.5 shrink-0 text-text-3" />
        )}
      </MenuTrigger>
      <MenuContent className="w-72">
        <MenuRadioGroup value={value} onValueChange={onValueChange}>
          <MenuLabel>{memberLabel}</MenuLabel>
          {members.map(item)}
          {guests.length > 0 ? (
            <>
              <MenuLabel>{guestLabel}</MenuLabel>
              {guests.map(item)}
            </>
          ) : null}
        </MenuRadioGroup>
        {footer ? (
          <>
            <MenuSeparator />
            {footer}
          </>
        ) : null}
      </MenuContent>
    </Menu>
  )
}
