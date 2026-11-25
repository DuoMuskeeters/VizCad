import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileSearch, FolderInput, FolderOpen, LayoutGrid, List, RefreshCw, Search, Star, Trash2, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/Button'
import { EmptyState } from '#/components/ui/EmptyState'
import { Input } from '#/components/ui/Input'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { SegmentedControl } from '#/components/ui/SegmentedControl'
import { Select } from '#/components/ui/Select'
import { SelectionBar, SelectionBarAction } from '#/components/ui/SelectionBar'
import { Skeleton } from '#/components/ui/Skeleton'
import { TabNav, TabNavLink } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { supportedTypesText } from '#/shared/fileTypes'
import { useI18n, type I18nKey } from '#/i18n'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'
import { MoveDialog, RenameDialog } from './FileDialogs'
import type { FileMenuHandlers } from './FileMenu'
import { FilesGrid } from './FilesGrid'
import { FilesTable } from './FilesTable'
import { startDownload } from './download'
import { useUploads } from './UploadProvider'
import { abilitiesOf, isFullView, type AnyFileView, type FileFilter, type FileSort } from './types'
import { useFileList } from './useFileList'

const FILTERS: readonly FileFilter[] = ['all', 'recent', 'starred', 'mine']
const SORTS: readonly FileSort[] = ['updated', 'created', 'name', 'size']
const VIEW_KEY = 'vizcad_files_view'

const readView = (): 'list' | 'grid' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

const SkeletonRows = () => (
  <div role="status" aria-busy="true" className="grid gap-px pt-2">
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 border-b border-line px-2 py-3.5">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5 app:hidden" />
        </div>
        <Skeleton className="hidden h-4 w-20 app:block" />
      </div>
    ))}
  </div>
)

const emptyKeys: Record<Exclude<FileFilter, 'all'>, { title: I18nKey; lead: I18nKey }> = {
  starred: { title: 'files.empty.starred.title', lead: 'files.empty.starred.lead' },
  recent: { title: 'files.empty.recent.title', lead: 'files.empty.recent.lead' },
  mine: { title: 'files.empty.mine.title', lead: 'files.empty.mine.lead' },
}

export const FilesPage = () => {
  const { t } = useI18n()
  const { call } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { active } = useWorkspace()
  const [filter, setFilter] = useState<FileFilter>('all')
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<FileSort>('updated')
  const [view, setView] = useState<'list' | 'grid'>(readView)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<AnyFileView | null>(null)
  const [moving, setMoving] = useState<readonly AnyFileView[]>([])
  const uploads = useUploads()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 300)
    return () => clearTimeout(id)
  }, [text])

  const list = useFileList(active.id, { filter, query: debounced, sort, direction: sort === 'name' ? 'asc' : 'desc' })
  const items = list.state.status === 'ready' ? list.state.items : []

  // A finished upload shows up in the list without a manual refresh.
  const { reload } = list
  useEffect(() => {
    if (uploads.finished > 0) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads.finished])

  // Selection only keeps files that are still in the list (filters and deletions change it).
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(items.map((item) => item.id))
      const kept = [...current].filter((id) => ids.has(id))
      return kept.length === current.size ? current : new Set(kept)
    })
  }, [items])

  const changeView = (next: string) => {
    const value = next === 'grid' ? 'grid' : 'list'
    setView(value)
    try {
      localStorage.setItem(VIEW_KEY, value)
    } catch {
      // The choice only lasts for this visit.
    }
  }

  const fail = useCallback((failure: Parameters<typeof failureKey>[0]) => toast({ title: t(failureKey(failure)), tone: 'danger' }), [toast, t])

  const toggleStar = useCallback(
    async (file: AnyFileView) => {
      if (!isFullView(file)) return
      const next = !file.starred
      list.patch(file.id, (current) => (isFullView(current) ? { ...current, starred: next } : current))
      const result = await call(next ? 'starFile' : 'unstarFile', { workspaceId: active.id, fileId: file.id })
      if (!result.ok) {
        list.patch(file.id, (current) => (isFullView(current) ? { ...current, starred: !next } : current))
        toast({ title: t('files.star.error'), tone: 'danger' })
      } else if (filter === 'starred' && !next) list.remove(new Set([file.id]))
    },
    [call, active.id, list, filter, toast, t],
  )

  const trash = useCallback(
    async (files: readonly AnyFileView[]) => {
      const done: string[] = []
      for (const file of files) {
        const result = await call('trashFile', { workspaceId: active.id, fileId: file.id })
        if (result.ok) done.push(file.id)
        else if (done.length === 0 && files.length === 1) return fail(result)
      }
      if (done.length === 0) return toast({ title: t('files.bulk.trashDenied'), tone: 'danger' })
      list.remove(new Set(done))
      setSelected(new Set())
      const title =
        files.length === 1 && files[0]
          ? t('files.trash.done', { name: files[0].name })
          : done.length === files.length
            ? done.length === 1 ? t('files.bulk.trashedOne') : t('files.bulk.trashed', { count: done.length })
            : t('files.bulk.partial', { done: done.length, total: files.length })
      toast({
        title,
        action: {
          label: t('files.bulk.undo'),
          onClick: () => {
            void Promise.all(done.map((fileId) => call('restoreFile', { workspaceId: active.id, fileId }))).then(() => {
              void list.reload()
              toast({ title: t('files.bulk.restored') })
            })
          },
        },
      })
    },
    [call, active.id, list, fail, toast, t],
  )

  const openFile = useCallback((file: AnyFileView) => void navigate({ to: '/app/files/$id', params: { id: file.id } }), [navigate])

  const handlersFor = useCallback(
    (file: AnyFileView): FileMenuHandlers => ({
      onOpen: () => openFile(file),
      onRename: () => setRenaming(file),
      onStar: () => void toggleStar(file),
      onMove: () => setMoving([file]),
      onShare: () => void navigate({ to: '/app/files/$id', params: { id: file.id }, search: { share: true } }),
      onDownload: () => startDownload(file.id),
      onTrash: () => void trash([file]),
      onSelect: () => setSelected((current) => new Set(current).add(file.id)),
    }),
    [openFile, toggleStar, trash, navigate],
  )

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const chosen = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected])
  const canTrashAll = chosen.length > 0 && chosen.every((file) => abilitiesOf(file).trash)
  const canMoveAll = chosen.length > 0 && chosen.every((file) => isFullView(file) && file.projectId !== null && file.can.edit)
  const searching = debounced.trim() !== ''

  const subtitle = active.kind === 'personal' ? t('app.workspace.personal') : active.name
  const countText = list.state.status === 'ready' && list.state.nextCursor === null ? (items.length === 1 ? t('files.subtitleOne') : t('files.subtitle', { count: items.length })) : null

  return (
    <>
      <PageHeader
        title={t('files.title')}
        subtitle={countText ? `${subtitle} · ${countText}` : subtitle}
        actions={
          <div className="hidden app:block">
            <Button variant="primary" onClick={() => uploads.pick()} {...(uploads.allowed ? {} : { disabledReason: t('files.uploadDenied') })}>
              <Upload aria-hidden className="size-4.5" />
              {t('files.upload')}
            </Button>
          </div>
        }
      />

      <div className="mb-1 flex flex-wrap items-center gap-x-3 border-b border-line">
        <TabNav aria-label={t('files.filter.label')} className="min-w-0 flex-1 border-b-0">
          {FILTERS.map((id) => (
            <TabNavLink key={id} asChild current={filter === id}>
              <button type="button" onClick={() => setFilter(id)}>
                {t(`files.filter.${id}` as I18nKey)}
              </button>
            </TabNavLink>
          ))}
        </TabNav>
        <div className="hidden shrink-0 items-center gap-1 app:flex">
          <Select variant="inline" aria-label={t('files.sort.label')} value={sort} onValueChange={(value) => setSort(value as FileSort)} options={SORTS.map((id) => ({ value: id, label: t(`files.sort.${id}` as I18nKey) }))} className="text-text-2" />
          <SegmentedControl
            size="sm"
            aria-label={t('files.view.label')}
            value={view}
            onValueChange={changeView}
            options={[
              { value: 'list', label: <><List aria-hidden /><span className="sr-only">{t('files.view.list')}</span></> },
              { value: 'grid', label: <><LayoutGrid aria-hidden /><span className="sr-only">{t('files.view.grid')}</span></> },
            ]}
          />
        </div>
      </div>

      <div className="relative py-3">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-text-3" />
        <Input type="search" aria-label={t('files.search.label')} placeholder={t('files.search.placeholder')} value={text} onChange={(event) => setText(event.target.value)} className="pl-10 app:max-w-90" />
      </div>

      {list.state.status === 'loading' ? <SkeletonRows /> : null}
      {list.state.status === 'error' ? (
        <div className="py-8">
          <InlineAlert title={t('files.error.title')} action={<Button onClick={() => void list.retry()}><RefreshCw aria-hidden className="size-4" />{t('common.retry')}</Button>}>
            {t('files.error.lead')}
          </InlineAlert>
        </div>
      ) : null}
      {list.state.status === 'ready' && items.length === 0 ? (
        searching ? (
          <EmptyState
            icon={<FileSearch />}
            title={t('files.empty.search.title', { query: debounced.trim() })}
            description={t('files.empty.search.lead')}
            actions={
              <Button onClick={() => { setText(''); setDebounced('') }}>
                <X aria-hidden className="size-4" />
                {t('files.empty.search.clear')}
              </Button>
            }
          />
        ) : filter === 'all' ? (
          <EmptyState
            icon={<FolderOpen />}
            title={t('files.empty.title')}
            description={uploads.allowed ? t('files.empty.lead', { types: supportedTypesText }) : t('files.empty.noUpload')}
            {...(uploads.allowed
              ? {
                  actions: (
                    <Button variant="primary" onClick={() => uploads.pick()}>
                      <Upload aria-hidden className="size-4.5" />
                      {t('files.empty.upload')}
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <EmptyState icon={filter === 'starred' ? <Star /> : <FolderOpen />} title={t(emptyKeys[filter].title)} description={t(emptyKeys[filter].lead)} />
        )
      ) : null}
      {list.state.status === 'ready' && items.length > 0 ? (
        <>
          {view === 'grid' ? (
            <FilesGrid files={items} selected={selected} onSelectedChange={toggleSelected} handlersFor={handlersFor} />
          ) : (
            <FilesTable files={items} selected={selected} onSelectedChange={toggleSelected} onSelectAll={(all) => setSelected(all ? new Set(items.map((item) => item.id)) : new Set())} handlersFor={handlersFor} />
          )}
          {list.state.nextCursor !== null ? (
            <div className="flex justify-center py-5">
              <Button loading={list.state.loadingMore} onClick={() => void list.loadMore()}>
                {list.state.loadingMore ? t('files.loadingMore') : t('files.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {selected.size > 0 ? (
        <SelectionBar
          label={selected.size === 1 ? t('files.bulk.selectedOne') : t('files.bulk.selected', { count: selected.size })}
          regionLabel={t('files.bulk.region')}
          clearLabel={t('files.bulk.clear')}
          onClear={() => setSelected(new Set())}
        >
          <SelectionBarAction icon={<FolderInput />} disabled={!canMoveAll} onClick={() => setMoving(chosen)} {...(canMoveAll ? {} : { title: t('files.reason.moveNoProject') })}>
            {t('files.bulk.move')}
          </SelectionBarAction>
          <SelectionBarAction icon={<Trash2 />} disabled={!canTrashAll} onClick={() => void trash(chosen)} {...(canTrashAll ? {} : { title: t('files.reason.trash') })}>
            {t('files.bulk.trash')}
          </SelectionBarAction>
        </SelectionBar>
      ) : null}

      {uploads.allowed && selected.size === 0 ? (
        <div className="fixed bottom-4 right-4 z-10 app:hidden">
          <Button variant="primary" onClick={() => uploads.pick()} className="h-12 rounded-full px-5 shadow-pop">
            <Upload aria-hidden className="size-4.5" />
            {t('files.upload')}
          </Button>
        </div>
      ) : null}

      {renaming ? (
        <RenameDialog
          key={renaming.id}
          file={renaming}
          workspaceId={active.id}
          onClose={() => setRenaming(null)}
          onRenamed={(name) => {
            list.patch(renaming.id, (file) => ({ ...file, name }))
            toast({ title: t('files.rename.done', { name }), tone: 'success' })
            setRenaming(null)
          }}
        />
      ) : null}
      {moving.length > 0 ? (
        <MoveDialog
          files={moving}
          workspaceId={active.id}
          onClose={() => setMoving([])}
          onMoved={(ids) => {
            void list.reload()
            toast({ title: t('files.move.done', { name: moving.length === 1 && moving[0] ? moving[0].name : String(ids.size) }), tone: 'success' })
            setMoving([])
            setSelected(new Set())
          }}
        />
      ) : null}
    </>
  )
}
