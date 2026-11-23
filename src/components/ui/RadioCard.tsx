import type { ComponentProps, ReactNode } from 'react'
import { RadioGroup } from 'radix-ui'
import { cx, fastTransition } from './cx'

export type RadioCardGroupProps = Omit<ComponentProps<typeof RadioGroup.Root>, 'children'> & {
  /** 2 puts the cards in two columns from 900px up (share dialog access level). */
  columns?: 1 | 2
  children: ReactNode
}

/** Arrow keys move the selection; it is one tab stop. Give it `aria-label` or `aria-labelledby`. */
export const RadioCardGroup = ({ columns = 1, className, ...rest }: RadioCardGroupProps) => (
  <RadioGroup.Root className={cx('grid gap-2', columns === 2 && 'app:grid-cols-2', className)} {...rest} />
)

export type RadioCardProps = Omit<ComponentProps<typeof RadioGroup.Item>, 'children' | 'title'> & {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
}

/** Selectable card (mockup `.opt`). A disabled card should say why in `description`. */
export const RadioCard = ({ title, description, icon, className, ...rest }: RadioCardProps) => (
  <RadioGroup.Item
    className={cx(
      'group grid min-h-11 grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md border border-line-strong bg-bg px-3.5 py-3 text-left',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft',
      'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-3',
      fastTransition,
      className,
    )}
    {...rest}
  >
    <span
      aria-hidden
      className="row-span-2 mt-0.5 size-4.5 rounded-full border-[1.5px] border-text-3 group-data-[state=checked]:border-[5px] group-data-[state=checked]:border-accent group-disabled:border-line-strong"
    />
    <span className="flex items-center gap-1.5 text-md font-medium app:text-base [&_svg]:size-4 [&_svg]:text-text-3">
      {title}
      {icon}
    </span>
    {description ? <span className="text-sm text-text-2 group-disabled:text-text-3">{description}</span> : null}
  </RadioGroup.Item>
)
