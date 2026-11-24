import type { ComponentProps, ReactNode } from 'react'
import { DropdownMenu as M } from 'radix-ui'
import { Check } from 'lucide-react'
import { cx, fastTransition } from './cx'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export const MenuRadioGroup = M.RadioGroup

export type MenuContentProps = ComponentProps<typeof M.Content>

export const MenuContent = ({ className, align = 'start', sideOffset = 6, ...rest }: MenuContentProps) => (
  <M.Portal>
    <M.Content
      align={align}
      sideOffset={sideOffset}
      collisionPadding={8}
      data-motion="pop"
      className={cx(
        'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-65 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-line bg-bg p-1.5 shadow-pop',
        className,
      )}
      {...rest}
    />
  </M.Portal>
)

export const MenuLabel = ({ className, ...rest }: ComponentProps<typeof M.Label>) => (
  <M.Label className={cx('px-2.5 pb-1 pt-2 text-xs font-medium text-text-3', className)} {...rest} />
)

export const MenuSeparator = ({ className, ...rest }: ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cx('my-1.5 h-px bg-line', className)} {...rest} />
)

const itemBase = cx(
  'relative flex min-h-11 w-full cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-md outline-none app:min-h-10 app:text-base',
  'data-highlighted:bg-hover data-disabled:text-text-3 aria-disabled:text-text-3',
  fastTransition,
)

type ItemExtras = {
  /** Leading icon or mark (a 26px workspace mark fits too). */
  icon?: ReactNode
  /** Second line under the label (access level text). */
  description?: ReactNode
  /** Makes the item inert and shows this text as its second line. The item stays focusable so the reason is reachable. */
  disabledReason?: string
  children: ReactNode
}

const ItemBody = ({ icon, description, children }: Pick<ItemExtras, 'icon' | 'description' | 'children'>) => (
  <>
    {icon ? <span className="grid shrink-0 place-items-center text-text-2 [&>svg]:size-4.5">{icon}</span> : null}
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block">{children}</span>
      {description ? <span className="block pt-0.5 text-xs text-text-3">{description}</span> : null}
    </span>
  </>
)

/** The inert attributes for an item that has a reason: focusable, announced as disabled, never selects. */
const inert = (disabledReason: string | undefined) =>
  disabledReason
    ? {
        'aria-disabled': true as const,
        'data-reason': '',
        onSelect: (event: Event) => event.preventDefault(),
      }
    : {}

export type MenuItemProps = Omit<ComponentProps<typeof M.Item>, 'children'> &
  ItemExtras & {
    /** `danger` for destructive items (red text). */
    tone?: 'default' | 'danger'
  }

export const MenuItem = ({ icon, description, disabledReason, tone = 'default', className, children, ...rest }: MenuItemProps) => (
  <M.Item
    {...rest}
    {...inert(disabledReason)}
    className={cx(itemBase, tone === 'danger' && !disabledReason && 'text-danger [&>span>svg]:text-danger', className)}
  >
    <ItemBody icon={icon} description={disabledReason ?? description}>
      {children}
    </ItemBody>
  </M.Item>
)

export type MenuRadioItemProps = Omit<ComponentProps<typeof M.RadioItem>, 'children'> & ItemExtras

/**
 * One choice of a single-choice menu; the selected one shows a check at the end (mockup access menu).
 * With `disabledReason` it renders as an inert, focusable radio that can never be selected
 * (Radix's RadioItem would still change the value on select).
 */
export const MenuRadioItem = ({ icon, description, disabledReason, className, children, value, ...rest }: MenuRadioItemProps) => {
  const body = (
    <ItemBody icon={icon} description={disabledReason ?? description}>
      {children}
    </ItemBody>
  )
  if (disabledReason) {
    return (
      <M.Item
        {...rest}
        role="menuitemradio"
        aria-checked={false}
        aria-disabled
        data-reason=""
        onSelect={(event) => event.preventDefault()}
        className={cx(itemBase, className)}
      >
        {body}
      </M.Item>
    )
  }
  return (
    <M.RadioItem {...rest} value={value} className={cx(itemBase, className)}>
      {body}
      <M.ItemIndicator className="ml-auto shrink-0 pl-2">
        <Check aria-hidden className="size-4.5 text-accent" />
      </M.ItemIndicator>
    </M.RadioItem>
  )
}
