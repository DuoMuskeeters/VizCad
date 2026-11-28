import type { ComponentProps, MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'

/**
 * A link inside the `/admin/$` splat route: client-side navigation (the gate and the loaded state stay), a real `href`
 * for new tabs and modified clicks.
 */
export const AdminLink = ({ href, onClick, ...rest }: ComponentProps<'a'> & { href: string }) => {
  const navigate = useNavigate()
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void navigate({ href })
  }
  return <a href={href} onClick={go} {...rest} />
}
