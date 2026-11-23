import type { ComponentProps, ReactNode } from 'react'
import { Slot, Tabs as T } from 'radix-ui'
import { cx, fastTransition } from './cx'

const listClass = 'border-b border-line'
const scroller = 'flex gap-5 overflow-x-auto [scrollbar-width:none]'
const tabClass = cx(
  'relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-md font-medium text-text-2 app:text-base',
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm after:content-['']",
  'hover:text-text',
  fastTransition,
)
const activeClass = 'text-text after:bg-brand'

const Count = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-medium text-text-3">{children}</span>
)

export const Tabs = T.Root
export const TabsContent = T.Content

export const TabsList = ({ className, ...rest }: ComponentProps<typeof T.List>) => (
  <div className={cx(listClass, className)}>
    <T.List className={scroller} {...rest} />
  </div>
)

export type TabsTriggerProps = ComponentProps<typeof T.Trigger> & { count?: number }

/** In-page tabs with panels (arrow keys move, one tab stop). For tabs that change the route use `TabNav`. */
export const TabsTrigger = ({ count, children, className, ...rest }: TabsTriggerProps) => (
  <T.Trigger className={cx(tabClass, 'data-[state=active]:text-text data-[state=active]:after:bg-brand', className)} {...rest}>
    {children}
    {count === undefined ? null : <Count>{count}</Count>}
  </T.Trigger>
)

/** Route tabs (links). The current one carries `aria-current="page"`. */
export const TabNav = ({ className, ...rest }: ComponentProps<'nav'>) => (
  <div className={cx(listClass, className)}>
    <nav className={scroller} {...rest} />
  </div>
)

export type TabNavLinkProps = ComponentProps<'a'> & {
  current?: boolean
  count?: number
  asChild?: boolean
}

export const TabNavLink = ({ current = false, count, asChild = false, className, children, ...rest }: TabNavLinkProps) => {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp {...(current ? { 'aria-current': 'page' as const } : {})} className={cx(tabClass, current && activeClass, className)} {...rest}>
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {count === undefined ? null : <Count>{count}</Count>}
        </>
      )}
    </Comp>
  )
}
