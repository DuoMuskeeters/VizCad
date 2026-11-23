import type { ComponentProps, ReactNode } from 'react'
import { Checkbox as C } from 'radix-ui'
import { Check, Minus } from 'lucide-react'
import { cx, fastTransition } from './cx'

export type CheckboxProps = Omit<ComponentProps<typeof C.Root>, 'children'>

/**
 * The box alone (table rows, bulk select). It is 16px, but a pseudo-element grows the hit area to 44px.
 * Always give it an accessible name: `aria-label` or a wrapping `<label>`.
 */
export const Checkbox = ({ className, ...rest }: CheckboxProps) => (
  <C.Root
    className={cx(
      'relative grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-line-strong bg-bg text-on-accent',
      "after:absolute after:-inset-3.5 after:content-['']",
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
      'disabled:cursor-not-allowed disabled:opacity-55',
      fastTransition,
      className,
    )}
    {...rest}
  >
    <C.Indicator>
      {rest.checked === 'indeterminate' ? (
        <Minus aria-hidden className="size-3 stroke-3" />
      ) : (
        <Check aria-hidden className="size-3 stroke-3" />
      )}
    </C.Indicator>
  </C.Root>
)

export type CheckboxFieldProps = CheckboxProps & {
  label: ReactNode
  description?: ReactNode
}

/** Checkbox with its own label (and optional description); the whole row is the click target. */
export const CheckboxField = ({ label, description, id, className, ...rest }: CheckboxFieldProps) => (
  <label className={cx('flex min-h-11 cursor-pointer items-start gap-3 py-2.5', className)}>
    <Checkbox {...(id ? { id } : {})} className="mt-0.5" {...rest} />
    <span className="grid min-w-0 gap-0.5">
      <span className="text-md font-medium app:text-base">{label}</span>
      {description ? <span className="text-sm text-text-3">{description}</span> : null}
    </span>
  </label>
)
