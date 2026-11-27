/**
 * The phone's parts module (docs/11 §4.4 "basit"): one level at a time as a flat, searchable list, entering
 * sub-assemblies to go deeper. No thumbnails, no indented tree. Used in the phone's parts sheet and its Parts view.
 */
import { useMemo, useState } from 'react'
import { Box, Boxes, ChevronLeft, ChevronRight, Eye, EyeOff, Search } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { useI18n } from '#/i18n'
import { findNode, isAssembly, parentOf, searchOutline, type OutlineNode } from '#/viewer/tree/outline'
import type { Namer } from './names'

export type PartsListProps = {
  readonly outline: OutlineNode
  readonly nameOf: Namer
  /** The level shown (a node with children). */
  readonly level: string
  readonly onLevel: (path: string) => void
  readonly selected: string | null
  readonly hidden: ReadonlySet<string>
  /** A tap on a row: selects (sheet) or shows in the assembly (Parts view). */
  readonly onActivate: (node: OutlineNode) => void
  readonly onToggleHidden: (path: string) => void
  /** In the Parts view a tap on a sub-assembly opens it, like a folder. */
  readonly enterOnTap?: boolean
  /** The level's name and the way up; off where a path bar already shows them (Parts view). */
  readonly showLevel?: boolean
}

export const PartsList = ({ outline, nameOf, level, onLevel, selected, hidden, onActivate, onToggleHidden, enterOnTap = false, showLevel = true }: PartsListProps) => {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const at = findNode(outline, level) ?? outline
  const found = useMemo(() => (query.trim() === '' ? null : searchOutline(outline, query, nameOf, 100, at)), [outline, query, nameOf, at])
  const items = found === null ? at.children.map((node) => ({ node, parentPath: at.path })) : found.hits
  const number = (n: number) => n.toLocaleString(locale)
  const up = parentOf(at.path)

  return (
    <div className="grid gap-2">
      <label className="relative block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('studio.tree.search')}
          aria-label={t('studio.tree.search')}
          className="h-11 w-full rounded-md border border-line-strong bg-bg pl-9 pr-3 text-lg placeholder:text-text-3"
        />
      </label>
      {showLevel && found === null && up !== null ? (
        <button type="button" onClick={() => onLevel(up)} className={cx('flex min-h-11 items-center gap-2 rounded-md px-1 text-left text-base text-accent hover:bg-hover', fastTransition)}>
          <ChevronLeft aria-hidden className="size-4.5 shrink-0" />
          <span className="truncate">
            <span className="sr-only">{t('studio.up')}: </span>
            {nameOf(findNode(outline, up) ?? outline)}
          </span>
        </button>
      ) : null}
      {showLevel && found === null ? <h3 className="px-1 text-sm font-medium text-text-2">{nameOf(at)}</h3> : null}
      {found !== null && found.hits.length === 0 ? (
        <div className="grid justify-items-center gap-2 px-2 py-6 text-center">
          <p className="text-base font-medium">{t('studio.search.empty', { query: query.trim() })}</p>
          <p className="text-sm text-text-2">{t('studio.search.emptyLead')}</p>
          <Button onClick={() => setQuery('')}>{t('studio.search.clear')}</Button>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map(({ node, parentPath }) => {
            const name = nameOf(node)
            const assembly = isAssembly(node)
            const off = hidden.has(node.path)
            const parent = found !== null && parentPath !== null ? findNode(outline, parentPath) : null
            const tapEnters = enterOnTap && assembly
            return (
              <li key={node.path} className={cx('flex min-h-14 items-center gap-1', selected === node.path && 'bg-accent-soft')}>
                <button
                  type="button"
                  onClick={() => (tapEnters ? (setQuery(''), onLevel(node.path)) : onActivate(node))}
                  aria-current={selected === node.path || undefined}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-1 text-left"
                >
                  {assembly ? <Boxes aria-hidden className="size-4.5 shrink-0 text-text-3" /> : <Box aria-hidden className="size-4.5 shrink-0 text-text-3" />}
                  <span className="min-w-0">
                    <span className={cx('block truncate text-md', off && 'text-text-3 line-through')}>{name}</span>
                    <span className="block truncate text-sm text-text-3">
                      {parent ? `${nameOf(parent)} · ` : ''}
                      {assembly ? t('studio.kind.assembly', { count: number(node.parts) }) : t('studio.kind.part')}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleHidden(node.path)}
                  aria-pressed={off}
                  aria-label={off ? t('studio.showNamed', { name }) : t('studio.hideNamed', { name })}
                  className="grid size-11 shrink-0 place-items-center rounded-md text-text-3 hover:bg-hover"
                >
                  {off ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
                </button>
                {assembly && !tapEnters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      onLevel(node.path)
                    }}
                    aria-label={t('studio.folder.enter', { name })}
                    className="grid size-11 shrink-0 place-items-center rounded-md text-text-2 hover:bg-hover"
                  >
                    <ChevronRight aria-hidden className="size-4.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
