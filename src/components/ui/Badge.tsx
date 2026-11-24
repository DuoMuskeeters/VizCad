import type { ComponentProps } from 'react'
import { cx } from './cx'

export type BadgeTone = 'neutral' | 'accent' | 'guest' | 'warn'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-hover text-text-2',
  accent: 'bg-accent-soft text-accent',
  // Guest = "from outside": same family as warn, different meaning (docs/03-design.md §5).
  guest: 'bg-guest-soft text-guest',
  warn: 'bg-warn-soft text-warn-text',
}

export type BadgeProps = ComponentProps<'span'> & { tone?: BadgeTone }

/** Short status text. Icons go in as children (12px). Never colour alone: the text carries the meaning. */
export const Badge = ({ tone = 'neutral', className, ...rest }: BadgeProps) => (
  <span
    className={cx(
      'inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium [&_svg]:size-3',
      tones[tone],
      className,
    )}
    {...rest}
  />
)
