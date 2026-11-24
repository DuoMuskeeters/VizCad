import type { ComponentProps, ReactNode } from 'react'
import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cx, fastTransition } from './cx'
import { controlBase } from './Input'
import { useFieldControl } from './Field'

export type SelectOption = {
  value: string
  label: ReactNode
  /** Second line in the list (not in the closed trigger). */
  description?: string
  disabled?: boolean
}

export type SelectProps = Omit<ComponentProps<typeof S.Root>, 'children'> & {
  options: readonly SelectOption[]
  placeholder?: string
  /**
   * `field`: bordered control for forms (mockup `.selectish`).
   * `inline`: borderless, border on hover, for table rows and toolbars (mockup `.pick`).
   */
  variant?: 'field' | 'inline'
  /** Accessible name when there is no surrounding <Field>. */
  'aria-label'?: string
  className?: string
}

export const Select = ({
  options,
  placeholder,
  variant = 'field',
  className,
  'aria-label': ariaLabel,
  ...root
}: SelectProps) => {
  const field = useFieldControl()
  return (
    <S.Root {...root}>
      <S.Trigger
        {...field}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        className={cx(
          'inline-flex items-center justify-between gap-2 whitespace-nowrap text-left',
          variant === 'field'
            ? cx(controlBase, 'h-11 app:h-10 data-placeholder:text-text-3')
            : cx(
                'h-11 rounded-md border border-transparent px-2.5 text-md hover:border-line-strong app:h-8.5 app:text-base',
                fastTransition,
              ),
          className,
        )}
      >
        <S.Value {...(placeholder ? { placeholder } : {})} />
        <S.Icon asChild>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-text-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          data-motion="pop"
          className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-line bg-bg p-1.5 shadow-pop"
        >
          <S.Viewport>
            {options.map((option) => (
              <S.Item
                key={option.value}
                value={option.value}
                {...(option.disabled ? { disabled: true } : {})}
                className={cx(
                  'flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-md outline-none app:min-h-10 app:text-base',
                  'data-highlighted:bg-hover data-disabled:text-text-3',
                )}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <S.ItemText>{option.label}</S.ItemText>
                  {option.description ? <span className="block text-xs text-text-3">{option.description}</span> : null}
                </span>
                <S.ItemIndicator>
                  <Check aria-hidden className="size-4 text-accent" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
