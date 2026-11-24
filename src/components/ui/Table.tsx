import type { ComponentProps } from 'react'
import { cx } from './cx'

/**
 * Semantic HTML table with design tokens, scroll container, and accessible focus/hover states.
 * Structure: Table > TableHeader/TableBody/TableFooter > TableRow > TableHead/TableCell.
 */
export const Table = ({ className, ...rest }: ComponentProps<'table'>) => (
  <div className="w-full min-w-0 max-w-full overflow-x-auto [scrollbar-width:thin]">
    <table className={cx('w-full min-w-120 caption-bottom text-left text-base text-text', className)} {...rest} />
  </div>
)

export const TableHeader = ({ className, ...rest }: ComponentProps<'thead'>) => (
  <thead className={cx('border-b border-line bg-surface text-sm font-medium text-text-3', className)} {...rest} />
)

export const TableBody = ({ className, ...rest }: ComponentProps<'tbody'>) => (
  <tbody className={cx('divide-y divide-line', className)} {...rest} />
)

export const TableFooter = ({ className, ...rest }: ComponentProps<'tfoot'>) => (
  <tfoot className={cx('border-t border-line bg-surface font-medium text-text-2', className)} {...rest} />
)

export const TableRow = ({ className, ...rest }: ComponentProps<'tr'>) => (
  <tr
    className={cx(
      'border-b border-line transition-colors duration-(--dur-fast) ease-out hover:bg-hover data-[selected=true]:bg-accent-soft',
      className,
    )}
    {...rest}
  />
)

export const TableHead = ({ className, ...rest }: ComponentProps<'th'>) => (
  <th
    className={cx(
      'h-11 px-3 text-left align-middle text-sm font-medium text-text-3 app:h-10 [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...rest}
  />
)

export const TableCell = ({ className, ...rest }: ComponentProps<'td'>) => (
  <td
    className={cx(
      'p-3 align-middle text-base text-text-2 [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...rest}
  />
)

export const TableCaption = ({ className, ...rest }: ComponentProps<'caption'>) => (
  <caption className={cx('mt-4 text-sm text-text-3', className)} {...rest} />
)
