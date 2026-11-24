import { createContext, use, useId, type ReactNode } from 'react'
import { cx } from './cx'

type FieldContext = {
  id: string
  /** Space-separated ids of the hint and error text that exist right now. */
  describedBy: string | undefined
  invalid: boolean
  required: boolean
}

const Ctx = createContext<FieldContext | null>(null)

/** What a control (Input, Textarea, SelectTrigger, ChipsInput …) spreads onto its element. */
export const useFieldControl = (): {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
} => {
  const field = use(Ctx)
  if (!field) return {}
  return {
    id: field.id,
    ...(field.describedBy ? { 'aria-describedby': field.describedBy } : {}),
    ...(field.invalid ? { 'aria-invalid': true as const } : {}),
    ...(field.required ? { 'aria-required': true as const } : {}),
  }
}

export type FieldProps = {
  label: ReactNode
  /** Quiet help text under the control. */
  hint?: ReactNode
  /** Error text. Presence marks the control invalid and is announced (role=alert). */
  error?: ReactNode
  required?: boolean
  /** Adds "(isteğe bağlı)" next to the label. Text is overridable for i18n. */
  optionalLabel?: string
  className?: string
  children: ReactNode
}

/** Label + control + hint + error. The control inside picks up id and aria-* through `useFieldControl`. */
export const Field = ({ label, hint, error, required = false, optionalLabel, className, children }: FieldProps) => {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const hasError = Boolean(error)
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <Ctx value={{ id, describedBy, invalid: hasError, required }}>
      <div className={cx('grid gap-1.5', className)}>
        <label htmlFor={id} className="text-md font-medium app:text-base">
          {label}
          {optionalLabel ? <span className="ml-1 font-regular text-text-3">({optionalLabel})</span> : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-sm text-text-3">
            {hint}
          </p>
        ) : null}
        {hasError ? (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Ctx>
  )
}
