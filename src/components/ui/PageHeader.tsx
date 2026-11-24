import type { ComponentType, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cx } from './cx'

export type Crumb = { label: string; href?: string }

type LinkComponent = ComponentType<{ href: string; className?: string; children: ReactNode }>
const PlainLink: LinkComponent = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
)

export type PageHeaderProps = {
  breadcrumb?: readonly Crumb[]
  breadcrumbLabel?: string
  title: ReactNode
  subtitle?: ReactNode
  /** Sits next to the title (visibility badge). */
  badge?: ReactNode
  /** Buttons on the right; they wrap under the title on narrow screens. */
  actions?: ReactNode
  /** Router link for crumbs: pass a component that takes `href`. Defaults to <a>. */
  linkAs?: LinkComponent
  className?: string
}

export const PageHeader = ({
  breadcrumb,
  breadcrumbLabel = 'Konum',
  title,
  subtitle,
  badge,
  actions,
  linkAs: Link = PlainLink,
  className,
}: PageHeaderProps) => (
  <div className={cx('mb-5', className)}>
    {breadcrumb && breadcrumb.length > 0 ? (
      <nav aria-label={breadcrumbLabel} className="mb-2">
        <ol className="flex flex-wrap items-center gap-1.5 text-base text-text-3">
          {breadcrumb.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="rounded-sm py-1.5 hover:text-text">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    ) : null}
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-heading tracking-heading">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="mt-1 text-base text-text-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 app:ml-auto">{actions}</div> : null}
    </div>
  </div>
)
