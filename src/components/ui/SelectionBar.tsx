import type { ComponentProps, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx, fastTransition } from './cx'

export type SelectionBarProps = {
  /** "2 dosya seçildi" */
  label: string
  /** Quiet extra ("98,6 MB"). */
  detail?: string
  /** <SelectionBarAction>s. */
  children: ReactNode
  onClear: () => void
  clearLabel?: string
  regionLabel?: string
}

/**
 * Bulk-action bar. Sticky at the bottom of the scrolling content, so it centers on the content column
 * (not the viewport) with or without a sidebar. Put it last in the page content; render it only while selecting.
 */
export const SelectionBar = ({
  label,
  detail,
  children,
  onClear,
  clearLabel = 'Seçimi kaldır',
  regionLabel = 'Seçili öğeler',
}: SelectionBarProps) => (
  <div role="region" aria-label={regionLabel} className="pointer-events-none sticky bottom-2 z-20 mt-6 app:bottom-6">
    <div className="pointer-events-auto mx-auto flex w-full items-center justify-between gap-1 rounded-lg bg-text py-1.5 pl-4 pr-1.5 text-bg shadow-pop app:w-fit app:justify-start">
      <span aria-live="polite" className="mr-2 text-base whitespace-nowrap app:mr-3">
        {label}
        {detail ? <span className="ml-1.5 text-bg/70">{detail}</span> : null}
      </span>
      {children}
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-bg/20 app:block" />
      <button
        type="button"
        onClick={onClear}
        className={cx('grid size-11 place-items-center rounded-md hover:bg-bg/10 app:size-9', fastTransition)}
      >
        <X aria-hidden className="size-4.5" />
        <span className="sr-only">{clearLabel}</span>
      </button>
    </div>
  </div>
)

export type SelectionBarActionProps = ComponentProps<'button'> & { icon: ReactNode }

/** Icon-only below 900px (the label stays for screen readers), icon + text above. */
export const SelectionBarAction = ({ icon, children, className, type = 'button', ...rest }: SelectionBarActionProps) => (
  <button
    type={type}
    className={cx(
      'inline-flex size-11 items-center justify-center gap-1.5 rounded-md text-base font-medium hover:bg-bg/10 app:h-9 app:w-auto app:px-3',
      fastTransition,
      className,
    )}
    {...rest}
  >
    <span aria-hidden className="grid [&>svg]:size-4.5">
      {icon}
    </span>
    <span className="sr-only app:not-sr-only">{children}</span>
  </button>
)
