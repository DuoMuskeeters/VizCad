import { useId, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import { Slot } from 'radix-ui'
import { Loader2 } from 'lucide-react'
import { controlHeight, cx, fastTransition } from './cx'
import { Tooltip } from './Tooltip'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet'

const variants: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border-line-strong bg-bg text-text hover:bg-hover',
  ghost: 'border-transparent bg-transparent text-text-2 hover:bg-hover hover:text-text',
  danger: 'border-danger bg-danger text-on-accent hover:brightness-90',
  'danger-quiet': 'border-danger/40 bg-bg text-danger hover:bg-danger-soft',
}

const base = cx(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-md font-medium',
  controlHeight,
  fastTransition,
)

const blockedClass = 'cursor-not-allowed opacity-55 hover:bg-inherit'

export type ButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  variant?: ButtonVariant
  /** Shows a spinner, announces `aria-busy` and ignores clicks. The button keeps focus and width. */
  loading?: boolean
  /** Disables the button and explains why (tooltip, plus a description for screen readers).
   * The button stays focusable, because a person who cannot act should still learn the reason. */
  disabledReason?: string
  /** Render the child element (e.g. a router link) with button styling; its content is wrapped like a normal button's. */
  asChild?: boolean
  children?: ReactNode
}

export const Button = ({
  variant = 'secondary',
  loading = false,
  disabledReason,
  asChild = false,
  className,
  disabled,
  onClick,
  type,
  children,
  ...rest
}: ButtonProps) => {
  const reasonId = useId()
  const [tipOpen, setTipOpen] = useState(false)
  const soft = loading || Boolean(disabledReason)
  const blocked = soft || Boolean(disabled)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (soft || disabled) {
      event.preventDefault()
      // Touch has no hover or focus tooltip: a tap on a blocked button shows the reason.
      if (disabledReason) setTipOpen(true)
      return
    }
    onClick?.(event)
  }

  const classes = cx(base, variants[variant], blocked && blockedClass, className)
  const common = {
    className: classes,
    onClick: handleClick,
    'aria-busy': loading || undefined,
    'aria-disabled': soft || undefined,
    'aria-describedby': disabledReason ? reasonId : undefined,
    ...rest,
  }

  const spinner = loading ? <Loader2 aria-hidden className="size-4.5 motion-safe:animate-spin" /> : null
  const element = asChild ? (
    <Slot.Root {...common}>
      {spinner}
      <Slot.Slottable>{children}</Slot.Slottable>
    </Slot.Root>
  ) : (
    <button type={type ?? 'button'} {...common} disabled={Boolean(disabled) && !soft}>
      {spinner}
      {children}
    </button>
  )

  if (!disabledReason) return element
  return (
    <>
      <Tooltip content={disabledReason} open={tipOpen} onOpenChange={setTipOpen}>
        {element}
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label'> & {
  /** Required: the accessible name and the tooltip text. */
  label: string
  children: ReactNode
  /** `sm` is the 32px inline kind (table rows); it still grows to 44px below 900px. */
  size?: 'md' | 'sm'
  /** The label doubles as a tooltip. Turn it off where the button gets focus on its own (dialog header),
   * so a tooltip never opens by itself and Escape closes the dialog on the first press. */
  tooltip?: boolean
}

export const IconButton = ({ label, children, size = 'md', variant = 'ghost', tooltip = true, className, ...rest }: IconButtonProps) => {
  const sizing = size === 'sm' ? 'size-11 app:size-8 rounded-sm' : 'size-11 app:size-9.5'
  const button = (
    <Button
      variant={variant}
      aria-label={label}
      className={cx('gap-0 px-0', sizing, size === 'sm' && 'border-transparent text-text-3', className)}
      {...rest}
    >
      {children}
    </Button>
  )
  // A reason tooltip already exists when disabledReason is set; otherwise the label is the tooltip.
  return rest.disabledReason || !tooltip ? button : <Tooltip content={label}>{button}</Tooltip>
}
