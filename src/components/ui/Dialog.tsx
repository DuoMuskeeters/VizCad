import type { ReactNode } from 'react'
import { Dialog as D } from 'radix-ui'
import { ArrowLeft, X } from 'lucide-react'
import { cx } from './cx'
import { IconButton } from './Button'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export type DialogContentProps = {
  /** Required: it is the dialog's accessible name. */
  title: ReactNode
  description?: ReactNode
  /** Rendered under the scrolling body; use <DialogFooter>. */
  footer?: ReactNode
  /** Shows a back arrow (multi-step flows such as share → add people). */
  onBack?: () => void
  backLabel?: string
  closeLabel?: string
  className?: string
  children?: ReactNode
}

/**
 * 900px and up: centered window. Below: bottom sheet. Focus is trapped, Escape and a click outside close it,
 * focus returns to the trigger. The body scrolls; header and footer stay put.
 */
export const DialogContent = ({
  title,
  description,
  footer,
  onBack,
  backLabel = 'Geri',
  closeLabel = 'Kapat',
  className,
  children,
}: DialogContentProps) => (
  <D.Portal>
    <D.Overlay
      data-motion="overlay"
      className="fixed inset-0 z-40 flex items-end justify-center bg-scrim app:items-center app:p-6"
    >
      <D.Content
        data-motion="sheet"
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cx(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-bg shadow-pop',
          'app:max-h-[calc(100dvh-48px)] app:max-w-130 app:rounded-xl',
          className,
        )}
      >
        <header className="flex items-start gap-2 px-4 pb-1 pt-4 app:px-6 app:pt-5">
          {onBack ? (
            <IconButton label={backLabel} tooltip={false} onClick={onBack} className="-ml-2">
              <ArrowLeft aria-hidden className="size-4.5" />
            </IconButton>
          ) : null}
          <div className="min-w-0 flex-1 pt-1.5">
            <D.Title className="text-xl font-heading tracking-heading">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-md text-text-2 app:text-base">{description}</D.Description>
            ) : null}
          </div>
          <D.Close asChild>
            <IconButton label={closeLabel} tooltip={false} className="-mr-2">
              <X aria-hidden className="size-4.5" />
            </IconButton>
          </D.Close>
        </header>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4 app:px-6">{children}</div>
        {footer}
      </D.Content>
    </D.Overlay>
  </D.Portal>
)

export type DialogFooterProps = {
  /** Quiet text on the left (desktop); sits above the buttons on mobile. */
  note?: ReactNode
  children: ReactNode
}

export const DialogFooter = ({ note, children }: DialogFooterProps) => (
  <footer className="flex flex-col gap-3 border-t border-line px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 app:flex-row app:items-center app:px-6 app:pb-5">
    {note ? <p className="text-sm text-text-3 app:max-w-60">{note}</p> : null}
    <div className="flex gap-2 app:ml-auto *:flex-1 app:*:flex-none">{children}</div>
  </footer>
)
