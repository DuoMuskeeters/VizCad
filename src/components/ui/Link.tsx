import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cx } from './cx'

export type TextLinkProps = ComponentProps<'a'> & {
  /** Style the child instead, e.g. `<TextLink asChild><RouterLink to="/x">…</RouterLink></TextLink>`. */
  asChild?: boolean
}

/** Inline link. Accent colour (5.4:1) with an underline so it does not rely on colour alone. */
export const TextLink = ({ asChild = false, className, ...rest }: TextLinkProps) => {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      className={cx(
        'rounded-sm font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover hover:decoration-current',
        className,
      )}
      {...rest}
    />
  )
}
