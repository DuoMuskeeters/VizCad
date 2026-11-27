/**
 * The desktop parts tree (docs/11 §4.2, wireframe 13 "Ağaç ve seçim"): search, indented rows with expand, select and
 * a per-row eye (my screen only, B2). Keyboard: arrows move between rows, Right/Left expand, collapse or go to the parent.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Box, Boxes, ChevronDown, ChevronRight, Eye, EyeOff, PanelLeftClose, Search, SearchX } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { useI18n } from '#/i18n'
import { chainOf, findNode, soleChain, isAssembly, isUnder, parentOf, searchOutline, visibleRows, type OutlineNode } from '#/viewer/tree/outline'
import { hiddenParts, type Namer } from './names'

export type TreeProps = {
  readonly outline: OutlineNode
  readonly nameOf: Namer
  readonly selected: string | null
  readonly isolated: string | null
  readonly hidden: ReadonlySet<string>
  readonly onSelect: (path: string) => void
  readonly onToggleHidden: (path: string) => void
  readonly onShowAll: () => void
  readonly onClose?: (() => void) | undefined
}

/** Indent per level as literal classes (no inline styles); deeper levels stay at the last step. */
const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20', 'pl-24', 'pl-28', 'pl-32'] as const

const rowBase = cx('group grid min-h-9 grid-cols-[28px_minmax(0,1fr)_auto] items-center rounded-md pr-1 pointer-coarse:min-h-11', fastTransition)

export const TreePanel = ({ outline, nameOf, selected, isolated, hidden, onSelect, onToggleHidden, onShowAll, onClose }: TreeProps) => {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(chainOf(soleChain(outline).path)))
  const list = useRef<HTMLDivElement>(null)

  // A selection made elsewhere (canvas, folder view, URL) opens the way to its row and brings it into view.
  useEffect(() => {
    if (selected === null) return
    setExpanded((current) => {
      const chain = chainOf(selected).slice(0, -1)
      return chain.every((p) => current.has(p)) ? current : new Set([...current, ...chain])
    })
  }, [selected])
  useEffect(() => {
    if (selected === null) return
    const row = list.current?.querySelector<HTMLElement>(`[data-path="${selected}"]`)
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, expanded])

  const rows = useMemo(() => visibleRows(outline, expanded), [outline, expanded])
  const found = useMemo(() => (query.trim() === '' ? null : searchOutline(outline, query, nameOf)), [outline, query, nameOf])
  const number = (n: number) => n.toLocaleString(locale)

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const focusRow = (path: string) => list.current?.querySelector<HTMLElement>(`[data-path="${path}"] [data-row-main]`)?.focus()
  const onKey = (event: KeyboardEvent<HTMLElement>, node: OutlineNode, open: boolean) => {
    const mains = [...(list.current?.querySelectorAll<HTMLElement>('[data-row-main]') ?? [])]
    const at = mains.indexOf(event.currentTarget)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      mains[at + (event.key === 'ArrowDown' ? 1 : -1)]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      ;(event.key === 'Home' ? mains[0] : mains.at(-1))?.focus()
    } else if (event.key === 'ArrowRight' && isAssembly(node)) {
      event.preventDefault()
      if (!open) toggle(node.path)
      else mains[at + 1]?.focus()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const parent = parentOf(node.path)
      if (open) toggle(node.path)
      else if (parent !== null) focusRow(parent)
    }
  }

  const eye = (node: OutlineNode, name: string) => {
    const off = hidden.has(node.path)
    return (
      <button
        type="button"
        onClick={() => onToggleHidden(node.path)}
        aria-label={off ? t('studio.showNamed', { name }) : t('studio.hideNamed', { name })}
        aria-pressed={off}
        className={cx('grid size-8 place-items-center rounded-md text-text-3 hover:bg-hover hover:text-text pointer-coarse:size-11', fastTransition)}
      >
        {off ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    )
  }

  const hiddenCount = hiddenParts(outline, hidden)
  const iso = isolated === null ? null : findNode(outline, isolated)

  return (
    <aside aria-label={t('studio.tree.label')} className="flex h-full min-h-0 flex-col border-r border-line bg-bg">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="text-md font-semibold">{t('studio.tree.title')}</h2>
        <span className="text-sm text-text-3">{number(outline.parts)}</span>
        {onClose ? (
          <IconButton label={t('studio.tree.hide')} size="sm" className="ml-auto" onClick={onClose}>
            <PanelLeftClose aria-hidden className="size-4.5" />
          </IconButton>
        ) : null}
      </div>
      <label className="relative mx-3 mb-2 block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('studio.tree.search')}
          aria-label={t('studio.tree.search')}
          className="h-11 w-full rounded-md border border-line-strong bg-bg pl-9 pr-3 text-lg placeholder:text-text-3 app:h-9.5 app:text-base"
        />
      </label>

      <div ref={list} role="tree" aria-label={t('studio.tree.label')} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {found !== null ? (
          found.hits.length === 0 ? (
            <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
              <SearchX aria-hidden className="size-6 text-text-3" />
              <p className="text-base font-medium">{t('studio.search.empty', { query: query.trim() })}</p>
              <p className="text-sm text-text-2">{t('studio.search.emptyLead')}</p>
              <Button onClick={() => setQuery('')}>{t('studio.search.clear')}</Button>
            </div>
          ) : (
            found.hits.map(({ node, parentPath }) => {
              const name = nameOf(node)
              const parent = parentPath === null ? null : findNode(outline, parentPath)
              return (
                <div key={node.path} data-path={node.path} role="treeitem" aria-level={1} aria-selected={selected === node.path} className={cx(rowBase, 'grid-cols-[minmax(0,1fr)_auto] pl-2', selected === node.path ? 'bg-accent-soft' : 'hover:bg-hover')}>
                  <button type="button" data-row-main="" onClick={() => onSelect(node.path)} onKeyDown={(event) => onKey(event, node, false)} className="flex min-w-0 items-center gap-2 py-1 text-left">
                    {isAssembly(node) ? <Boxes aria-hidden className="size-4 shrink-0 text-text-3" /> : <Box aria-hidden className="size-4 shrink-0 text-text-3" />}
                    <span className="min-w-0">
                      <span className="block truncate text-base">{name}</span>
                      {parent ? <span className="block truncate text-xs text-text-3">{nameOf(parent)}</span> : null}
                    </span>
                  </button>
                  {eye(node, name)}
                </div>
              )
            })
          )
        ) : (
          rows.map(({ node, depth, expanded: open }) => {
            const name = nameOf(node)
            const off = hidden.has(node.path)
            const out = iso !== null && !isUnder(node.path, iso.path) && !isUnder(iso.path, node.path)
            const assembly = isAssembly(node)
            const sel = selected === node.path
            return (
              <div
                key={node.path}
                data-path={node.path}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={sel}
                {...(assembly ? { 'aria-expanded': open } : {})}
                className={cx(rowBase, INDENT[Math.min(depth, INDENT.length - 1)], sel ? 'bg-accent-soft' : 'hover:bg-hover', (off || out) && 'text-text-3')}
              >
                {assembly ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => toggle(node.path)}
                    aria-label={open ? t('studio.tree.collapse', { name }) : t('studio.tree.expand', { name })}
                    className="grid size-7 place-items-center rounded-sm text-text-3 hover:text-text pointer-coarse:size-11"
                  >
                    {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  data-row-main=""
                  onClick={() => onSelect(node.path)}
                  onDoubleClick={() => assembly && toggle(node.path)}
                  onKeyDown={(event) => onKey(event, node, open)}
                  className={cx('flex min-w-0 items-center gap-2 py-1 text-left text-base', sel && 'font-medium', off && 'line-through decoration-text-3/60')}
                >
                  {assembly ? <Boxes aria-hidden className={cx('size-4 shrink-0', sel ? 'text-accent' : 'text-text-3')} /> : <Box aria-hidden className={cx('size-4 shrink-0', sel ? 'text-accent' : 'text-text-3')} />}
                  <span className="truncate">{name}</span>
                  {assembly ? <span className="ml-auto shrink-0 pl-2 text-sm tabular-nums text-text-3">{number(node.parts)}</span> : null}
                </button>
                {eye(node, name)}
              </div>
            )
          })
        )}
      </div>

      <div className="flex min-h-11 items-center gap-2 border-t border-line px-4 text-sm text-text-2">
        {found !== null ? (
          <span>{found.more ? t('studio.search.more', { count: number(found.hits.length) }) : t('studio.search.results', { count: number(found.hits.length) })}</span>
        ) : iso !== null ? (
          <span className="truncate">{t('studio.footer.isolated', { name: nameOf(iso), count: number(iso.parts) })}</span>
        ) : hiddenCount > 0 ? (
          <>
            <span>{t('studio.footer.hidden', { count: number(outline.parts), hidden: number(hiddenCount) })}</span>
            <Button variant="ghost" className="ml-auto h-11 px-2 text-sm text-accent app:h-8" onClick={onShowAll}>
              {t('studio.showAll')}
            </Button>
          </>
        ) : (
          <span>{t('studio.footer.parts', { count: number(outline.parts) })}</span>
        )}
      </div>
    </aside>
  )
}
