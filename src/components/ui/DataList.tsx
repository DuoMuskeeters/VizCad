import { createContext, use, type ComponentProps, type ReactNode } from 'react'
import { cx, fastTransition } from './cx'
import { Checkbox } from './Checkbox'

type ListContext = { columns: string; selecting: boolean }
const Ctx = createContext<ListContext | null>(null)
const useList = (): ListContext => {
  const list = use(Ctx)
  if (!list) throw new Error('DataList parts must be used inside <DataList>')
  return list
}

export type DataListProps = ComponentProps<'div'> & {
  /**
   * Desktop column template as a literal Tailwind class so it is picked up at build time, e.g.
   * `app:grid-cols-[28px_minmax(0,1fr)_150px_110px_76px_168px_36px]`. Below 900px every row is two lines + actions.
   */
  columns: string
  /** True while at least one row is selected: checkboxes stay visible (and appear on mobile). */
  selecting?: boolean
}

/**
 * Table semantics (role=table) on a CSS grid. Compose: DataListHeader (desktop only) + DataListBody > DataListRow >
 * DataListSelectCell / DataListPrimary / DataListCell. Selection is the checkbox; no aria-selected (not valid on tables).
 */
export const DataList = ({ columns, selecting = false, className, ...rest }: DataListProps) => (
  <Ctx value={{ columns, selecting }}>
    <div role="table" className={cx('w-full', className)} {...rest} />
  </Ctx>
)

const rowBase = 'grid items-center gap-x-4 px-2 app:px-2'

export const DataListHeader = ({ className, ...rest }: ComponentProps<'div'>) => {
  const { columns } = useList()
  return (
    <div role="rowgroup" className="hidden app:block">
      <div role="row" className={cx(rowBase, 'min-h-10 text-sm font-medium text-text-3', columns, className)} {...rest} />
    </div>
  )
}

export const DataListHead = ({ align = 'start', className, ...rest }: ComponentProps<'div'> & { align?: 'start' | 'end' }) => (
  <div role="columnheader" className={cx(align === 'end' && 'text-right', className)} {...rest} />
)

export const DataListBody = ({ className, ...rest }: ComponentProps<'div'>) => (
  <div role="rowgroup" className={cx('border-t border-line', className)} {...rest} />
)

export type DataListRowProps = ComponentProps<'div'> & { selected?: boolean }

export const DataListRow = ({ selected = false, className, ...rest }: DataListRowProps) => {
  const { columns, selecting } = useList()
  return (
    <div
      role="row"
      data-selected={selected ? '' : undefined}
      data-selecting={selecting ? '' : undefined}
      className={cx(
        rowBase,
        'group/row min-h-17 border-b border-line app:min-h-15',
        selecting ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
        columns,
        'hover:bg-surface data-selected:border-b-accent/20 data-selected:bg-accent-soft',
        fastTransition,
        className,
      )}
      {...rest}
    />
  )
}

export type DataListCellProps = ComponentProps<'div'> & {
  align?: 'start' | 'end'
  /** Cells that only exist in the desktop columns (owner, date, size, access). */
  desktopOnly?: boolean
}

export const DataListCell = ({ align = 'start', desktopOnly = false, className, ...rest }: DataListCellProps) => (
  <div
    role="cell"
    className={cx(
      'min-w-0 text-base text-text-2',
      align === 'end' && 'text-right tabular-nums',
      desktopOnly && 'hidden app:block',
      className,
    )}
    {...rest}
  />
)

export type DataListSelectCellProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Accessible name, e.g. "Flanş_DN100_rev3.step seç". */
  label: string
}

/** Checkbox cell: shown on hover/focus/selection on desktop, always on touch pointers, and on mobile while selecting. */
export const DataListSelectCell = ({ checked, onCheckedChange, label }: DataListSelectCellProps) => {
  const { selecting } = useList()
  return (
    <div
      role="cell"
      className={cx(
        'place-items-center pr-2 app:flex app:pr-0',
        selecting ? 'grid' : 'hidden app:grid',
        'app:opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-selecting/row:opacity-100 group-data-selected/row:opacity-100 pointer-coarse:opacity-100',
      )}
    >
      <Checkbox
        aria-label={label}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </div>
  )
}

/** File-type tile ("STEP", "STL"). */
export const FileTile = ({ ext, className }: { ext: string; className?: string }) => (
  <span
    aria-hidden
    className={cx(
      'grid size-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-[10px] font-bold tracking-wide text-text-2',
      className,
    )}
  >
    {ext}
  </span>
)

export type DataListPrimaryProps = {
  leading?: ReactNode
  /** The name. Pass a link here; it truncates to one line. */
  children: ReactNode
  /** Second line, shown only below 900px where the columns are gone ("Ayşe Yılmaz · Bugün 14:20 · 12,4 MB"). */
  meta?: ReactNode
  /** Right of the name (star). */
  trailing?: ReactNode
}

export const DataListPrimary = ({ leading, children, meta, trailing }: DataListPrimaryProps) => (
  <div role="cell" className="flex min-w-0 items-center gap-3">
    {leading}
    <div className="min-w-0 flex-1 leading-snug">
      <div className="truncate text-lg font-medium app:text-base">{children}</div>
      {meta ? <div className="truncate text-sm text-text-3 app:hidden">{meta}</div> : null}
    </div>
    {trailing}
  </div>
)
