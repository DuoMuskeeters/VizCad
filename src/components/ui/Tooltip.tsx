import type { ReactNode } from 'react'
import { Tooltip as T } from 'radix-ui'

/** Optional: share the "skip delay" behaviour between neighbouring tooltips. Each Tooltip also works alone. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={300} skipDelayDuration={200}>
    {children}
  </T.Provider>
)

type TooltipProps = {
  /** Short plain text. Tooltips never carry the only copy of important info (touch has no hover). */
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** The trigger child must be a single focusable element. */
export const Tooltip = ({ content, children, side = 'top', open, onOpenChange }: TooltipProps) => (
  <T.Provider delayDuration={300} skipDelayDuration={200}>
    <T.Root {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
      <T.Content
        side={side}
        sideOffset={6}
        collisionPadding={8}
        data-motion="pop"
        className="z-60 max-w-72 rounded-md bg-text px-2.5 py-1.5 text-sm text-bg shadow-pop"
      >
        {content}
      </T.Content>
      </T.Portal>
    </T.Root>
  </T.Provider>
)
