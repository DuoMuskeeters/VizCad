import type { ComponentProps } from 'react'
import { cx, fastTransition } from './cx'
import { useFieldControl } from './Field'

export const controlBase = cx(
  'w-full rounded-md border border-line-strong bg-bg px-3 text-text placeholder:text-text-3',
  // 16px on small screens: iOS zooms into smaller inputs on focus.
  'text-lg app:text-base',
  'focus-visible:border-transparent focus-visible:outline-offset-[-1px]',
  'aria-invalid:border-danger',
  'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-3',
  fastTransition,
)

export type InputProps = ComponentProps<'input'>

export const Input = ({ className, ...rest }: InputProps) => {
  const field = useFieldControl()
  return <input {...field} {...rest} className={cx(controlBase, 'h-11 app:h-10', className)} />
}

export type TextareaProps = ComponentProps<'textarea'>

export const Textarea = ({ className, rows = 3, ...rest }: TextareaProps) => {
  const field = useFieldControl()
  return <textarea {...field} rows={rows} {...rest} className={cx(controlBase, 'min-h-22 resize-y py-2.5', className)} />
}
