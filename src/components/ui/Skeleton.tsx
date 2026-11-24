import type { ComponentProps } from 'react'
import { cx } from './cx'

/** Placeholder block; size it with classes (`h-2.5 w-1/2`). Pulses only when motion is allowed. */
export const Skeleton = ({ className, ...rest }: ComponentProps<'div'>) => (
  <div aria-hidden className={cx('rounded-md bg-line motion-safe:animate-pulse', className)} {...rest} />
)
