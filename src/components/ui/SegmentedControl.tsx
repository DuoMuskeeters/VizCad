import type { ComponentProps, ReactNode } from 'react'
import { RadioGroup } from 'radix-ui'
import { cx, fastTransition } from './cx'

export type SegmentOption = { value: string; label: ReactNode; icon?: ReactNode }

export type SegmentedControlProps = Omit<ComponentProps<typeof RadioGroup.Root>, 'children' | 'orientation'> & {
  options: readonly SegmentOption[]
  /** Stretch to the container (settings on mobile). */
  fullWidth?: boolean
  /** `sm` is for dense toolbars (view switch); touch still gets 44px. */
  size?: 'md' | 'sm'
}

/** Exactly one option is always selected. Built on a radio group: arrow keys move and select. */
export const SegmentedControl = ({ options, fullWidth = false, size = 'md', className, ...rest }: SegmentedControlProps) => (
  <RadioGroup.Root
    orientation="horizontal"
    className={cx(
      'grid grid-flow-col auto-cols-fr gap-0.5 rounded-lg bg-hover p-0.75',
      fullWidth ? 'w-full' : 'w-fit max-w-full',
      className,
    )}
    {...rest}
  >
    {options.map((option) => (
      <RadioGroup.Item
        key={option.value}
        value={option.value}
        className={cx(
          'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-md font-medium text-text-2 app:text-base',
          size === 'md' ? 'px-4 app:h-9.5' : 'px-3 app:h-7.5 app:px-2.5',
          'hover:text-text data-[state=checked]:border-line data-[state=checked]:bg-bg data-[state=checked]:text-text',
          '[&_svg]:size-4',
          fastTransition,
        )}
      >
        {option.icon}
        {option.label}
      </RadioGroup.Item>
    ))}
  </RadioGroup.Root>
)
