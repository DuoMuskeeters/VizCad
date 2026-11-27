/**
 * The "Parts" view (docs/11 §4.1, wireframe 13 "Parçalar"): the assembly opened like a folder. Desktop: path, the
 * "Assembly · N parts" band, a search of this level and a grid (part thumbnails drawn one by one from the open model,
 * A3) or list. Phone: the same path and band over the flat parts list (§4.4). `?node=` is the level.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Box, Boxes, ChevronRight, Ellipsis, Folder, LayoutGrid, Link2, List, Loader2, MousePointer2, Package, Search, SearchX } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { useI18n } from '#/i18n'
import { findNode, isAssembly, searchOutline, type OutlineNode } from '#/viewer/tree/outline'
import { pathNames, type Namer } from './names'
import { PartsList } from './PartsList'

/** Thumbnails are drawn at 2× the card's CSS size, 4:3. */
const THUMB_W = 392
const THUMB_H = 294

export type ThumbnailSource = (path: string, width: number, height: number) => Promise<Blob | null>

/**
 * Draws the thumbnails of `paths` one at a time (A3: in the browser, on demand) into `cache` (path → object URL, owned
 * by the page, freed with the model). Stops as soon as `paths` changes or the view closes; returns how many are done.
 */
const useThumbnails = (paths: readonly string[], draw: ThumbnailSource, cache: Map<string, string>) => {
  const [, setTick] = useState(0)
  const key = paths.join(',')
  useEffect(() => {
    let stopped = false
    void (async () => {
      for (const path of paths) {
        if (stopped) return
        if (cache.has(path)) continue
        // One frame between drawings keeps the page responsive on a 455-part level.
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (stopped) return
        const blob = await draw(path, THUMB_W, THUMB_H).catch(() => null)
        if (stopped) return
        if (blob !== null && !cache.has(path)) cache.set(path, URL.createObjectURL(blob))
        setTick((n) => n + 1)
      }
    })()
    return () => {
      stopped = true
    }
    // `key` stands for `paths`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, draw, cache])
  return paths.filter((path) => cache.has(path)).length
}

export type FolderViewProps = {
  readonly outline: OutlineNode
  readonly nameOf: Namer
  readonly level: string
  readonly wide: boolean
  readonly selected: string | null
  readonly hidden: ReadonlySet<string>
  readonly onLevel: (path: string) => void
  /** Open in 3D: `path` isolated, or the whole model for the root. */
  readonly onOpen3d: (path: string) => void
  /** Back to 3D with this node selected, the whole assembly visible. */
  readonly onShowInAssembly: (path: string) => void
  readonly onCopyLink: (path: string) => void
  readonly onToggleHidden: (path: string) => void
  readonly thumbnail: ThumbnailSource
  readonly thumbnails: Map<string, string>
  /** More items for a part's menu (STL, 5c-2). */
  readonly menuExtra?: ((node: OutlineNode) => ReactNode) | undefined
}

export const FolderView = (props: FolderViewProps) => {
  const { outline, nameOf, level, wide, onLevel, onOpen3d } = props
  const { t, locale } = useI18n()
  const at = findNode(outline, level) ?? outline
  const crumbs = pathNames(outline, at.path, nameOf)
  const number = (n: number) => n.toLocaleString(locale)
  const assemblies = at.children.filter(isAssembly).length
  const root = at.path === '0'

  return (
    <section aria-label={t('studio.folder.label')} className="min-h-0 overflow-y-auto bg-bg px-4 pb-12 pt-3 app:h-full app:px-7 app:pt-5">
      <nav aria-label={t('studio.crumbs')} className="-ml-2 mb-2 flex min-w-0 flex-wrap items-center gap-0.5 text-base">
        {crumbs.map((step, i) =>
          i === crumbs.length - 1 ? (
            <b key={step.path} aria-current="page" className="min-w-0 truncate px-2 font-semibold">
              {step.name}
            </b>
          ) : (
            <span key={step.path} className="flex min-w-0 items-center gap-0.5">
              <button type="button" onClick={() => onLevel(step.path)} className={cx('flex h-11 max-w-48 items-center truncate rounded-md px-2 text-text-2 hover:bg-hover hover:text-text app:h-9', fastTransition)}>
                <span className="truncate">{step.name}</span>
              </button>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-3" />
            </span>
          ),
        )}
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-3 app:px-4 app:py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {root ? <Package aria-hidden className="size-5" /> : <Boxes aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug">{root ? t('studio.kind.root', { count: number(at.parts) }) : t('studio.kind.assembly', { count: number(at.parts) })}</h1>
          <p className="text-base text-text-2">{t('studio.band.lead', { assemblies: number(assemblies), parts: number(at.children.length - assemblies) })}</p>
        </div>
        <Button onClick={() => onOpen3d(at.path)} className="w-full app:w-auto">
          <Box aria-hidden className="size-4.5" />
          {root ? t('studio.band.open') : t('studio.band.openThis')}
        </Button>
      </div>

      {wide ? (
        <WideLevel {...props} at={at} />
      ) : (
        <PartsList
          outline={outline}
          nameOf={nameOf}
          level={at.path}
          onLevel={onLevel}
          selected={props.selected}
          hidden={props.hidden}
          onActivate={(node) => props.onShowInAssembly(node.path)}
          onToggleHidden={props.onToggleHidden}
          enterOnTap
          showLevel={false}
        />
      )}
    </section>
  )
}

type Layout = 'grid' | 'list'

const WideLevel = ({ outline, nameOf, at, onLevel, onOpen3d, onShowInAssembly, onCopyLink, thumbnail, thumbnails, menuExtra }: FolderViewProps & { at: OutlineNode }) => {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<Layout>('grid')
  const found = useMemo(() => (query.trim() === '' ? null : searchOutline(outline, query, nameOf, 200, at)), [outline, query, nameOf, at])
  const items = found === null ? at.children : found.hits.map((hit) => hit.node)
  const paths = useMemo(() => items.map((node) => node.path), [items])
  const done = useThumbnails(paths, thumbnail, thumbnails)
  const number = (n: number) => n.toLocaleString(locale)
  const meta = (node: OutlineNode) => (isAssembly(node) ? t('studio.kind.assembly', { count: number(node.parts) }) : t('studio.kind.part'))
  const activate = (node: OutlineNode) => (isAssembly(node) ? (setQuery(''), onLevel(node.path)) : onShowInAssembly(node.path))

  const menu = (node: OutlineNode, name: string) => (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={t('studio.folder.actions', { name })} size="sm">
          <Ellipsis aria-hidden className="size-4.5" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<MousePointer2 />} onSelect={() => onShowInAssembly(node.path)}>
          {t('studio.showInAssembly')}
        </MenuItem>
        <MenuItem icon={<Box />} onSelect={() => onOpen3d(node.path)}>
          {t('studio.isolate')}
        </MenuItem>
        {menuExtra?.(node)}
        <MenuSeparator />
        <MenuItem icon={<Link2 />} onSelect={() => onCopyLink(node.path)}>
          {t('studio.copyLink')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )

  const thumb = (node: OutlineNode, className: string, label: boolean) => {
    const url = thumbnails.get(node.path)
    return (
      <span className={cx('relative grid place-items-center overflow-hidden bg-canvas', className)}>
        {url ? (
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <span className="grid justify-items-center gap-1.5 text-sm text-canvas-text/80">
            <Loader2 aria-hidden className="size-5 text-brand motion-safe:animate-spin" />
            {label ? t('studio.folder.drawing') : null}
          </span>
        )}
      </span>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative block w-72 max-w-full">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('studio.folder.search')}
            aria-label={t('studio.folder.search')}
            className="h-11 w-full rounded-md border border-line-strong bg-bg pl-9 pr-3 text-lg placeholder:text-text-3 app:h-9.5 app:text-base"
          />
        </label>
        {done < paths.length ? (
          <p role="status" className="flex items-center gap-2 text-sm text-text-2">
            {t('studio.folder.progress', { done: number(done), total: number(paths.length) })}
          </p>
        ) : null}
        <div role="group" aria-label={t('studio.folder.layout')} className="ml-auto inline-flex rounded-md bg-hover p-0.5">
          {(['grid', 'list'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              aria-label={value === 'grid' ? t('studio.folder.grid') : t('studio.folder.list')}
              onClick={() => setLayout(value)}
              className={cx('grid size-11 place-items-center rounded-sm text-text-3 app:h-8 app:w-9', layout === value && 'bg-bg text-text shadow-xs', fastTransition)}
            >
              {value === 'grid' ? <LayoutGrid aria-hidden className="size-4" /> : <List aria-hidden className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {found !== null && found.hits.length === 0 ? (
        <div className="grid justify-items-center gap-2 py-10 text-center">
          <SearchX aria-hidden className="size-6 text-text-3" />
          <p className="text-base font-medium">{t('studio.search.empty', { query: query.trim() })}</p>
          <p className="max-w-md text-sm text-text-2">{t('studio.search.emptyLead')}</p>
          <Button onClick={() => setQuery('')}>{t('studio.search.clear')}</Button>
        </div>
      ) : layout === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-4">
          {items.map((node) => {
            const name = nameOf(node)
            return (
              <li key={node.path} className="grid gap-2">
                <button type="button" onClick={() => activate(node)} aria-label={isAssembly(node) ? t('studio.folder.enter', { name }) : `${name}. ${t('studio.showInAssembly')}`} className="relative block rounded-md">
                  {thumb(node, 'aspect-4/3 w-full rounded-md', true)}
                  {isAssembly(node) ? (
                    <span className="absolute left-2 top-2 inline-flex h-6 items-center gap-1.5 rounded-full bg-canvas/85 px-2 text-sm font-medium text-canvas-text">
                      <Folder aria-hidden className="size-3.5" />
                      {t('studio.parts', { count: number(node.parts) })}
                    </span>
                  ) : null}
                </button>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1">
                  <span className="min-w-0">
                    <span className="block truncate text-md font-medium">{name}</span>
                    <span className="block truncate text-sm text-text-3">{meta(node)}</span>
                  </span>
                  {menu(node, name)}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="border-t border-line">
          {items.map((node) => {
            const name = nameOf(node)
            return (
              <li key={node.path} className="grid min-h-16 grid-cols-[56px_minmax(0,1fr)_150px_auto] items-center gap-4 border-b border-line py-2">
                {thumb(node, 'h-10.5 w-14 rounded-sm', false)}
                <button type="button" onClick={() => activate(node)} className="flex min-h-11 min-w-0 items-center gap-2 text-left text-md font-medium">
                  {isAssembly(node) ? <Folder aria-hidden className="size-4 shrink-0 text-text-3" /> : <Box aria-hidden className="size-4 shrink-0 text-text-3" />}
                  <span className="truncate">{name}</span>
                </button>
                <span className="text-base text-text-2">{isAssembly(node) ? t('studio.folder.kindAssembly') : t('studio.folder.kindPart')}</span>
                <span className="flex items-center gap-3">
                  <span className="w-24 text-base tabular-nums text-text-2">{isAssembly(node) ? t('studio.parts', { count: number(node.parts) }) : ''}</span>
                  {menu(node, name)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
