import type { ReactNode } from 'react'
import { cx } from './cx'

export type EmptyStateProps = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Buttons; the first is usually the primary action. */
  actions?: ReactNode
  /** Quiet footnote (accepted file types). */
  note?: ReactNode
  className?: string
}

export const EmptyState = ({ icon, title, description, actions, note, className }: EmptyStateProps) => (
  <section className={cx('mx-auto grid max-w-110 justify-items-center gap-2.5 px-4 py-12 text-center app:py-18', className)}>
    <span aria-hidden className="mb-2 grid size-16 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-6.5">
      {icon}
    </span>
    <h2 className="text-xl font-heading tracking-heading">{title}</h2>
    {description ? <p className="text-md text-text-2">{description}</p> : null}
    {actions ? <div className="mt-2.5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    {note ? <p className="mt-1.5 text-sm text-text-3">{note}</p> : null}
  </section>
)
