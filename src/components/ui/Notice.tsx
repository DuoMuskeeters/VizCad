import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cx } from './cx'

export type NoticeTone = 'info' | 'warn' | 'success'

const tones: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-surface', icon: 'text-text-3', Icon: Info },
  warn: { box: 'border border-warn/30 bg-warn-soft', icon: 'text-warn', Icon: TriangleAlert },
  success: { box: 'bg-surface', icon: 'text-success', Icon: CircleCheck },
}

export type NoticeProps = {
  tone?: NoticeTone
  children: ReactNode
  className?: string
}

/** Short inline note in a form or dialog (mockup `.notice` / seat warning). Put links inside `children`. */
export const Notice = ({ tone = 'info', children, className }: NoticeProps) => {
  const { box, icon, Icon } = tones[tone]
  return (
    <div role="status" className={cx('flex gap-2.5 rounded-md px-3.5 py-3 text-md text-text-2 app:text-base', box, className)}>
      <Icon aria-hidden className={cx('mt-0.5 size-4.5 shrink-0', icon)} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export type InlineAlertProps = {
  title: ReactNode
  children?: ReactNode
  /** Retry button etc. */
  action?: ReactNode
  className?: string
}

/** Error card for a region that failed to load (mockup `.alert`). Announced immediately. */
export const InlineAlert = ({ title, children, action, className }: InlineAlertProps) => (
  <section
    role="alert"
    className={cx('mx-auto flex max-w-130 gap-3.5 rounded-lg border border-danger/30 bg-danger-soft px-5 py-4.5', className)}
  >
    <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
    <div className="min-w-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <p className="mt-0.5 text-md text-text-2">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  </section>
)
