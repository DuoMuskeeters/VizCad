import { vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'

/** A stand-in for `@tanstack/react-router` in component tests: links are plain anchors, navigation is recorded. */
export const navigate = vi.fn()

const Link = ({ to, params, children, ...rest }: { to: string; params?: Record<string, string>; children?: ReactNode } & ComponentProps<'a'>) => {
  const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}

export const routerMock = { Link, useNavigate: () => navigate, useParams: () => ({ id: 'f1' }), useSearch: () => ({}) }
