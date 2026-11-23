import type { ComponentProps, ReactNode } from 'react'
import { RadioGroup } from 'radix-ui'
import { cx, fastTransition } from './cx'

export type SegmentOption = { value: string; label: ReactNode; icon?: ReactNode }

export type SegmentedControlProps = Omit<ComponentProps<typeof RadioGroup.Root>, 'children' | 'orientation'> & {
  options: readonly SegmentOption[]
  /** Stretch to the container (settings on mobile). */
  fullWidth?: boolean
}

/** Exactly one option is always selected. Built on a radio group: arrow keys move and select. */
export const SegmentedControl = ({ options, fullWidth = false, className, ...rest }: SegmentedControlProps) => (
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
          'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-md font-medium text-text-2 app:h-9.5 app:text-base',
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
