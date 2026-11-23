import type { ComponentProps, ReactNode } from 'react'
import { Switch as Sw } from 'radix-ui'
import { cx } from './cx'

export type SwitchProps = Omit<ComponentProps<typeof Sw.Root>, 'children'>

/** Track alone. Always needs an accessible name (`aria-label` or a wrapping label). Hit area is 44px. */
export const Switch = ({ className, ...rest }: SwitchProps) => (
  <Sw.Root
    className={cx(
      'relative h-6 w-10 shrink-0 rounded-full bg-text-3 transition-colors duration-(--dur-fast) ease-out motion-reduce:transition-none',
      "after:absolute after:-inset-2.5 after:content-['']",
      'data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-55',
      className,
    )}
    {...rest}
  >
    <Sw.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform duration-(--dur-fast) ease-out data-[state=checked]:translate-x-[18px] motion-reduce:transition-none" />
  </Sw.Root>
)

export type SwitchRowProps = SwitchProps & {
  label: ReactNode
  description?: ReactNode
}

/** Label + description on the left, switch on the right; the whole row toggles (mockup `.sw`). */
export const SwitchRow = ({ label, description, className, ...rest }: SwitchRowProps) => (
  <label className={cx('flex min-h-15 w-full cursor-pointer items-center justify-between gap-4 py-1.5 app:min-h-14', className)}>
    <span className="grid min-w-0 gap-0.5">
      <span className="text-md font-medium app:text-base">{label}</span>
      {description ? <span className="text-sm text-text-3">{description}</span> : null}
    </span>
    <Switch {...rest} />
  </label>
)
