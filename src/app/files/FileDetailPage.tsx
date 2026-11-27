import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { Box, ChevronLeft, Download, FileQuestion, LayoutGrid, ListTree, Loader2, PanelLeft, PanelRight, Share2, X } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button, IconButton } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { EmptyState } from '#/components/ui/EmptyState'
import { FileTile } from '#/components/ui/DataList'
import { InlineAlert } from '#/components/ui/Notice'
import { Skeleton } from '#/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { fileTypeOfExtension } from '#/shared/fileTypes'
import { sourceTooLarge } from '#/shared/fileViews'
import { useI18n } from '#/i18n'
import { canMakeThumbnail, deferOpen, isPhone, readDeviceHints } from '#/viewer/device'
import type { StudioView } from '#/viewer/scene/studio'
import type { ViewerStart } from '#/viewer/state'
import { findNode, isNodePath, levelOf, outlineShape, type OutlineNode } from '#/viewer/tree/outline'
import type { ViewerApi } from '#/viewer/Viewer.client'
import { converterOf, ERROR_CODES, formatOfExtension, isConvertFormat, type ErrorCode, type Stats } from '#/viewer/worker/protocol'
import { reportDerivativeFailure, uploadDerivative } from './derivative'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'
import { MoveDialog, RenameDialog } from './FileDialogs'
import { FileMenu } from './FileMenu'
import { ActivityTab, CommentsTab, VersionsTab } from './FileTabs'
import { startDownload } from './download'
import { formatBytes, formatDateTime, tileText } from './format'
import { ShareDialog } from './ShareDialog'
import { uploadThumbnail } from './thumbnail'
import { abilitiesOf, contentUrl, isFullView, modelUrl, thumbnailUrl, type AnyFileView } from './types'
import { type UploadItem, UploadPill, useUploads } from './UploadProvider'
import { FolderView } from './studio/FolderView'
import { baseName, counted, formatSize, makeNamer, pathNames } from './studio/names'
import { PathBar, SelectionBar } from './studio/Overlays'
import { PartsList } from './studio/PartsList'
import { initialStudio, studioReducer } from './studio/state'
import { createThumbnailStore } from './studio/thumbnails'
import { TreePanel } from './studio/TreePanel'
import { useWide } from './studio/useWide'

/** The viewer chunk (three.js) loads only here, on the client: the server build never sees it (app routes have no SSR). */
const loadViewer = createClientOnlyFn(() => import('#/viewer/Viewer.client'))
const Viewer = lazy(loadViewer)

/** What the viewer area shows while its chunk loads: the thumbnail on the canvas colour, like the viewer's own loading state. */
const ViewerFallback = ({ src, fill }: { src: string | null; fill: boolean }) => (
  <div className={cx('grid min-w-0 gap-2', fill && 'h-full grid-rows-[minmax(0,1fr)_auto]')}>
    <div className={cx('relative overflow-hidden bg-canvas', fill ? 'h-full' : 'h-[min(62dvh,600px)] min-h-72 rounded-lg')}>
      {src ? <img src={src} alt="" className="absolute inset-0 size-full object-contain" /> : null}
    </div>
    <div className="h-11 app:h-9.5" />
  </div>
)

/** The reason a too_large file has no 3D for this caller: the limit when the source is over it, else the GLB cap. */
const tooLargeText = (t: ReturnType<typeof useI18n>['t'], file: AnyFileView) =>
  sourceTooLarge(file) ? t('viewer.error.tooLarge', { size: `${Math.round(file.model.maxConvertBytes / (1024 * 1024))} MB` }) : t('viewer.derivativeTooLarge')

/** The code a failed derivative stored; an unknown one reads as "could not be read". */
const storedCode = (code: string | null): ErrorCode => ERROR_CODES.find((known) => known === code) ?? 'corrupt'

/**
 * Why there is no 3D for this caller (docs/11 §8): no derivative yet (only an edit user's desktop open makes one), too
 * large, a failed conversion, or (only download is missing) the old "view only" note.
 */
const noModelText = (t: ReturnType<typeof useI18n>['t'], file: AnyFileView) => {
  const derivative = file.model.derivative
  if (fileTypeOfExtension(file.extension) === undefined) return t('file.preview.note')
  if (derivative?.state === 'too_large') return tooLargeText(t, file)
  if (derivative?.state === 'failed') {
    const code = storedCode(derivative.code)
    return t(code === 'empty' ? 'viewer.error.empty' : code === 'timeout' || code === 'out_of_memory' ? 'viewer.error.device' : code === 'too_complex' ? 'viewer.error.tooComplex' : 'viewer.error.corrupt')
  }
  return t('viewer.notPrepared')
}

type State = { readonly status: 'loading' } | { readonly status: 'missing' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly file: AnyFileView }

/** `?node=` (docs/11 §1.3) and `?view=parts` (the folder view). */
export type FileSearch = { share?: boolean; node?: string; view?: 'parts' }

export const validateFileSearch = (search: Record<string, unknown>): FileSearch => ({
  ...(search['share'] === true || search['share'] === 'true' ? { share: true } : {}),
  ...(isNodePath(search['node']) ? { node: search['node'] } : {}),
  ...(search['view'] === 'parts' ? { view: 'parts' as const } : {}),
})

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="text-base text-text-3">{label}</dt>
    <dd className="min-w-0 break-words text-base">{children}</dd>
  </>
)

const Details = ({ file, outline }: { file: AnyFileView; outline: OutlineNode | null }) => {
  const { t, locale } = useI18n()
  const label = fileTypeOfExtension(file.extension)?.label ?? file.extension.toUpperCase()
  const shape = outline !== null && outline.parts > 1 ? outlineShape(outline) : null
  const number = (n: number) => n.toLocaleString(locale)
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 py-1">
      <Row label={t('file.details.format')}>{label}</Row>
      <Row label={t('file.details.size')}>{formatBytes(file.size, locale)}</Row>
      {outline !== null && shape !== null ? (
        <>
          <Row label={t('studio.details.content')}>{t('studio.details.contentValue', { count: number(outline.parts) })}</Row>
          <Row label={t('studio.details.levels')}>{counted(t, locale, 'studio.details.levelsValue', shape.depth, { assemblies: counted(t, locale, 'studio.assemblies', shape.assemblies) })}</Row>
        </>
      ) : null}
      <Row label={t('file.details.version')}>
        <span className="inline-flex items-center gap-2">
          {file.currentVersion.number}
          <Badge tone="accent">{t('file.details.current')}</Badge>
        </span>
      </Row>
      {isFullView(file) ? (
        <>
          {file.currentVersion.uploadedBy ? (
            <Row label={t('file.details.uploader')}>
              <span className="inline-flex items-center gap-2">
                <Avatar name={file.currentVersion.uploadedBy.displayName} size="xs" decorative />
                {file.currentVersion.uploadedBy.displayName}
              </span>
            </Row>
          ) : null}
          <Row label={t('file.details.created')}>{formatDateTime(file.createdAt, locale)}</Row>
          <Row label={t('file.details.modified')}>{formatDateTime(file.updatedAt, locale)}</Row>
          <Row label={t('file.details.project')}>{file.projectName ?? <span className="text-text-3">{t('file.details.noProject')}</span>}</Row>
        </>
      ) : (
        <>
          <Row label={t('file.details.sharedBy')}>{file.sharedBy.displayName}</Row>
          <Row label={t('file.details.modified')}>{formatDateTime(file.updatedAt, locale)}</Row>
        </>
      )}
    </dl>
  )
}

/**
 * The page frame (B1): full width, outside the app's menu, with the studio's own top bar and a skip link to `#main`
 * (every state has its `<main>`). `sub` is a second bar row for what does not fit next to the title below 360 px.
 */
const Frame = ({ bar, sub, children }: { bar: ReactNode; sub?: ReactNode; children: ReactNode }) => {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col app:h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-bg px-3 py-2 font-medium text-text focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        {t('app.nav.skip')}
      </a>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bg px-1.5 app:h-15 app:gap-2 app:px-4">{bar}</header>
      {sub ? <div className="flex shrink-0 justify-center border-b border-line bg-bg px-1.5 py-1 min-[360px]:hidden">{sub}</div> : null}
      {children}
    </div>
  )
}

/** `<main>` of the states without a file (loading, missing, error). */
const PlainMain = ({ children }: { children: ReactNode }) => (
  <main id="main" tabIndex={-1} className="min-w-0 outline-none">
    {children}
  </main>
)

const BackLink = ({ file }: { file: AnyFileView | null }) => {
  const { t } = useI18n()
  const project = file !== null && isFullView(file) && file.projectId !== null ? { id: file.projectId, name: file.projectName ?? t('file.back') } : null
  const className = cx('inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-base text-text-2 hover:bg-hover hover:text-text app:h-9.5', fastTransition)
  const body = (label: string) => (
    <>
      <ChevronLeft aria-hidden className="size-5 shrink-0" />
      <span className="sr-only app:not-sr-only app:max-w-44 app:truncate">{label}</span>
    </>
  )
  return project ? (
    <Link to="/app/projects/$id" params={{ id: project.id }} className={className}>
      {body(project.name)}
    </Link>
  ) : (
    <Link to="/app" className={className}>
      {body(t('file.back'))}
    </Link>
  )
}

/**
 * The file page as the studio (docs/03 §2.5, D18, D23, docs/11 §4, B1): full width, the 3D viewer whenever `model` has
 * something for this caller (every level for a GLB derivative or an STL/OBJ/PLY; a STEP/IGES/3MF source only with
 * download, converted in place and, for an edit user on a desktop, stored as the derivative); otherwise the thumbnail or
 * file card with the reason; and the tabbed panel. An assembly adds the parts tree, the folder view (`?view=parts`),
 * selection, isolation (`?node=`) and hiding on this screen (B2).
 */
export const FileDetailPage = () => {
  const { t, locale } = useI18n()
  const { call, expire } = useSession()
  const { active } = useWorkspace()
  const { toast } = useToast()
  const navigate = useNavigate()
  const uploads = useUploads()
  const wide = useWide()
  const { id } = useParams({ strict: false }) as { id: string }
  const search = useSearch({ strict: false }) as FileSearch
  const [state, setState] = useState<State>({ status: 'loading' })
  const [renaming, setRenaming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [sharing, setSharing] = useState(search.share === true)
  const [tab, setTab] = useState('details')
  const [versionKey, setVersionKey] = useState(0)
  const phone = useMemo(() => isPhone(readDeviceHints()), [])

  // The studio: the open model's outline and what this screen does with it (never saved, B2), in one reducer.
  const [studioState, dispatch] = useReducer(studioReducer, null, initialStudio)
  const { outline, ready: modelReady, selected, hidden, sheet } = studioState
  const [treeOpen, setTreeOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const api = useRef<ViewerApi | null>(null)
  const [thumbnails] = useState(createThumbnailStore)

  const load = useCallback(async () => {
    const result = await call<AnyFileView>('getFile', { workspaceId: active.id, fileId: id })
    if (result.ok) setState({ status: 'ready', file: result.data })
    else if (result.error === 'Unauthenticated') expire()
    else setState({ status: result.error === 'ResourceUnavailable' || result.error === 'PermissionDenied' ? 'missing' : 'error' })
  }, [call, expire, active.id, id])

  useEffect(() => {
    setState({ status: 'loading' })
    void load()
  }, [load])

  // The viewer rendered a thumbnail for a file without one (lazy path, docs/11 §9 5a): store it, then show it. The
  // endpoint stores on whatever is current when it lands, so a thumbnail of a version that is no longer current (or
  // with a new version on its way) is dropped.
  const shown = useRef<{ file: AnyFileView | null; uploading: readonly UploadItem[] }>({ file: null, uploading: [] })
  shown.current = { file: state.status === 'ready' ? state.file : null, uploading: uploads.items }
  const saveThumbnail = useCallback((fileId: string, version: number, blob: Blob) => {
    const still = (file: AnyFileView | null) => file !== null && file.id === fileId && file.currentVersion.number === version
    const pending = shown.current.uploading.some((item) => item.targetFileId === fileId && (item.status === 'queued' || item.status === 'uploading'))
    if (!still(shown.current.file) || pending) return
    void uploadThumbnail(fileId, version, blob).then((stored) => {
      if (stored) setState((current) => (current.status === 'ready' && still(current.file) ? { status: 'ready', file: { ...current.file, thumbnailAvailable: true } } : current))
    })
  }, [])

  // The viewer converted the source and wrote its GLB (docs/11 §2.5 lazy path): store it in the background, unless the
  // version moved on meanwhile (the server refuses that too). The page keeps showing the model it has; the next open
  // reads the GLB.
  const saveDerivative = useCallback((fileId: string, version: number, extension: string, glb: ArrayBuffer, stats: Stats) => {
    const format = formatOfExtension(extension)
    const pending = shown.current.uploading.some((item) => item.targetFileId === fileId && (item.status === 'queued' || item.status === 'uploading'))
    if (format === null || pending || shown.current.file?.id !== fileId || shown.current.file.currentVersion.number !== version) return
    void uploadDerivative({ fileId, version, glb, stats, converter: converterOf(format) })
  }, [])
  const recordFailure = useCallback((fileId: string, version: number, code: ErrorCode) => {
    void reportDerivativeFailure({ fileId, version, code })
  }, [])

  // This tab's upload queue is converting the file (docs/11 §2.5): the page shows Preparing and starts no second
  // conversion; when the job ends (stored, failed or dropped) the file is read again, and Preparing stays until that
  // read has answered, so the viewer never mounts with the old model (it would convert again, even after a recorded
  // failure). `held` is set during render, so no commit sees the job ended and the hold not yet on.
  const preparingHere = state.status === 'ready' && uploads.preparing.has(state.file.id)
  const [held, setHeld] = useState<string | null>(null)
  if (preparingHere && held !== state.file.id) setHeld(state.file.id)
  useEffect(() => {
    if (held === null || preparingHere) return
    // Only the latest reload releases the hold: a new job (or a new load) marks this one stale.
    let stale = false
    void load().finally(() => {
      if (!stale) setHeld((current) => (current === held ? null : current))
    })
    return () => {
      stale = true
    }
  }, [held, preparingHere, load])

  // A new version finished uploading: the file card and the version list change.
  useEffect(() => {
    if (uploads.finished > 0) {
      void load()
      setVersionKey((key) => key + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads.finished])

  // Another model (a new version, another file) or Preparing (no viewer, so no model): the studio starts over at once
  // (during render, so no frame shows the old tree) and the old thumbnails are freed.
  const shownFile = state.status === 'ready' ? state.file : null
  const shownFormat = shownFile === null ? null : formatOfExtension(shownFile.extension)
  const preparingModel = shownFile !== null && shownFormat !== null && isConvertFormat(shownFormat) && shownFile.model.kind !== 'derivative' && (preparingHere || held === shownFile.id)
  const modelKey = shownFile === null ? null : `${shownFile.id}:${shownFile.currentVersion.number}${preparingModel ? ':preparing' : ''}`
  if (studioState.key !== modelKey) dispatch({ type: 'reset', key: modelKey })
  useEffect(() => () => thumbnails.clear(), [modelKey, thumbnails])

  const nodeParam = search.node
  const node = outline !== null && nodeParam !== undefined && findNode(outline, nodeParam) !== null ? nodeParam : null
  const stale = outline !== null && nodeParam !== undefined && node === null
  const partsView = search.view === 'parts'
  const isolated = !partsView && node !== null && node !== '0' ? node : null
  // Isolating a hidden node shows it again (the viewer draws it anyway: an isolated node is never blank).
  useEffect(() => {
    if (isolated !== null) dispatch({ type: 'unhide', path: isolated })
  }, [isolated])
  const view = useMemo<StudioView>(() => ({ selected, isolated, hidden, looks: new Map() }), [selected, isolated, hidden])
  const studio = useMemo(
    () => ({
      view,
      api,
      onOutline: (next: OutlineNode | null) => dispatch({ type: 'outline', outline: next }),
      onPick: (path: string | null) => dispatch({ type: 'select', path }),
      onReady: (ready: boolean) => dispatch({ type: 'ready', ready }),
    }),
    [view],
  )
  const setSelected = useCallback((path: string | null) => dispatch({ type: 'select', path }), [])
  const setSheet = useCallback((next: { level: string } | null) => dispatch({ type: 'sheet', sheet: next }), [])
  const showAll = useCallback(() => dispatch({ type: 'showAll' }), [])

  const go = useCallback(
    (next: { node?: string | null; view?: 'parts' | null }) => {
      const target: FileSearch = { ...search }
      delete target.share
      if (next.node !== undefined) {
        if (next.node === null) delete target.node
        else target.node = next.node
      }
      if (next.view !== undefined) {
        if (next.view === null) delete target.view
        else target.view = next.view
      }
      void navigate({ to: '/app/files/$id', params: { id }, search: target })
    },
    [navigate, id, search],
  )
  const toggleHidden = useCallback((path: string) => dispatch({ type: 'toggleHidden', path }), [])
  const copyLink = useCallback(
    (path: string) => {
      const url = `${window.location.origin}/app/files/${encodeURIComponent(id)}?node=${path}`
      void (navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('no clipboard'))).then(
        () => toast({ title: t('studio.copied'), tone: 'success' }),
        () => toast({ title: t('studio.copyFailed'), tone: 'danger' }),
      )
    },
    [id, toast, t],
  )
  const drawThumbnail = useCallback((path: string, width: number, height: number) => api.current?.thumbnail(path, width, height) ?? Promise.resolve(null), [])

  const file = state.status === 'ready' ? state.file : null
  const nameOf = useMemo(() => makeNamer(baseName(file?.name ?? ''), t('studio.unnamed')), [file?.name, t])

  // The phone sheet closes with Escape.
  useEffect(() => {
    if (sheet === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, setSheet])

  if (state.status === 'loading')
    return (
      <Frame bar={<BackLink file={null} />}>
        <PlainMain>
          <div role="status" aria-busy="true" aria-label={t('file.loading')} className="grid gap-4 p-4 app:grid-cols-[minmax(0,1fr)_360px] app:p-6">
            <Skeleton className="aspect-4/3 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </PlainMain>
      </Frame>
    )
  if (state.status === 'missing')
    return (
      <Frame bar={<BackLink file={null} />}>
        <PlainMain>
        <div className="px-4 py-10">
          <EmptyState
            icon={<FileQuestion />}
            title={t('file.notFound.title')}
            description={t('file.notFound.lead')}
            actions={
              <Button asChild>
                <Link to="/app">{t('file.notFound.back')}</Link>
              </Button>
            }
          />
        </div>
        </PlainMain>
      </Frame>
    )
  if (state.status === 'error')
    return (
      <Frame bar={<BackLink file={null} />}>
        <PlainMain>
          <div className="px-4 py-10">
            <InlineAlert title={t('file.error.title')} action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}>
              {t('files.error.lead')}
            </InlineAlert>
          </div>
        </PlainMain>
      </Frame>
    )

  const loaded = state.file
  const can = abilitiesOf(loaded)
  const typeLabel = fileTypeOfExtension(loaded.extension)?.label ?? loaded.extension.toUpperCase()
  const format = formatOfExtension(loaded.extension)
  const thumbnail = loaded.thumbnailAvailable ? thumbnailUrl(loaded.id, loaded.currentVersion.number) : null
  const model = loaded.model
  const derivative = model.derivative
  const converts = format !== null && isConvertFormat(format)
  // Edit + download on a desktop, reading the source: the viewer converts it and the GLB is stored (lazy path, §2.5).
  const storesDerivative = converts && model.kind === 'source' && can.edit && can.download && !phone
  // The same person with a stored GLB that does not load may rebuild it from the source.
  const rebuilds = converts && model.kind === 'derivative' && can.edit && can.download && !phone
  // A stored too_large counts only while the source is over the limit (`sourceTooLarge`); a conversion that fails on
  // its own (a 3MF past its inflate budget is `too_complex`) is a `failed` record and is never converted again unasked.
  const start: ViewerStart = !converts || model.kind !== 'source' ? 'auto'
    : sourceTooLarge(loaded) ? { failed: 'too_large' }
    : derivative?.state === 'failed' ? { failed: storedCode(derivative.code) }
    : format !== null && deferOpen(format, phone) ? 'phone'
    : 'auto'

  const preparing = preparingModel
  const hasViewer = !preparing && model.kind !== 'none' && format !== null
  // An assembly (A4: more than one part) gets the tree and the Parts view; before the model is open the stored count decides.
  const parts = outline?.parts ?? derivative?.parts ?? 0
  const assembly = hasViewer && parts > 1
  const studioReady = assembly && modelReady && outline !== null
  const showFolder = studioReady && partsView
  const selectedNode = outline !== null && selected !== null ? findNode(outline, selected) : null
  const number = (n: number) => n.toLocaleString(locale)
  const subtitle = assembly
    ? t('studio.subtitle', { type: typeLabel, size: formatBytes(loaded.size, locale), count: number(parts) })
    : `${typeLabel} · ${formatBytes(loaded.size, locale)}`

  const handlers = {
    onRename: () => setRenaming(true),
    onStar: () => {
      if (!isFullView(loaded)) return
      const next = !loaded.starred
      setState({ status: 'ready', file: { ...loaded, starred: next } })
      void call(next ? 'starFile' : 'unstarFile', { workspaceId: active.id, fileId: loaded.id }).then((result) => {
        if (!result.ok) {
          setState({ status: 'ready', file: loaded })
          toast({ title: t('files.star.error'), tone: 'danger' })
        }
      })
    },
    onMove: () => setMoving(true),
    onShare: () => setSharing(true),
    onDownload: () => startDownload(loaded.id),
    onTrash: () => {
      void call('trashFile', { workspaceId: active.id, fileId: loaded.id }).then((result) => {
        if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
        toast({ title: t('file.trashed', { name: loaded.name }) })
        void navigate({ to: '/app' })
      })
    },
  }

  const viewSwitch = (where: 'bar' | 'row') => (
    <nav aria-label={t('studio.view.label')} className={cx('flex shrink-0 rounded-lg bg-hover p-0.5', where === 'bar' && 'max-[359px]:hidden')}>
      {(
        [
          ['model', false, <Box key="i" aria-hidden className="size-4" />, t('studio.view.model')],
          ['parts', true, <LayoutGrid key="i" aria-hidden className="size-4" />, t('studio.view.parts')],
        ] as const
      ).map(([key, parts, icon, label]) => (
        <button
          key={key}
          type="button"
          aria-current={partsView === parts ? 'page' : undefined}
          onClick={() => go({ view: parts ? 'parts' : null })}
          className={cx(
            'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2.5 text-base font-medium text-text-2 app:h-8.5',
            partsView === parts ? 'bg-bg text-text shadow-xs' : 'hover:text-text',
            fastTransition,
          )}
        >
          {icon}
          {/* The second row (below 360 px) has room for the words. */}
          <span className={where === 'row' ? undefined : 'sr-only app:not-sr-only'}>{label}</span>
        </button>
      ))}
    </nav>
  )

  const bar = (
    <>
      <BackLink file={loaded} />
      <span aria-hidden className="hidden h-6 w-px bg-line app:block" />
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-md font-semibold leading-tight app:text-lg">{loaded.name}</h1>
        {assembly ? (
          <p className="truncate text-sm text-text-2">
            <span className="hidden app:inline">{subtitle}</span>
            <span className="app:hidden">{t('studio.subtitleShort', { version: loaded.currentVersion.number, count: number(parts) })}</span>
          </p>
        ) : (
          <p className="truncate text-sm text-text-2">{subtitle}</p>
        )}
      </div>
      {assembly ? viewSwitch('bar') : null}
      <div className="flex shrink-0 items-center gap-1 app:gap-2">
        <UploadPill />
        {wide ? (
          <>
            <Button onClick={() => startDownload(loaded.id)} {...(can.download ? {} : { disabledReason: t('files.reason.download') })}>
              <Download aria-hidden className="size-4.5" />
              {t('file.download')}
            </Button>
            <Button variant="primary" onClick={() => setSharing(true)} {...(can.share ? {} : { disabledReason: t('files.reason.share') })}>
              <Share2 aria-hidden className="size-4.5" />
              {t('file.share')}
            </Button>
          </>
        ) : (
          // Phone: Share as an icon; Download stays in the file menu (wireframe 13, 390 px).
          <IconButton variant="primary" label={t('file.share')} onClick={() => setSharing(true)} {...(can.share ? {} : { disabledReason: t('files.reason.share') })}>
            <Share2 aria-hidden className="size-4.5" />
          </IconButton>
        )}
        <FileMenu file={loaded} handlers={handlers} triggerClassName="size-11 app:size-9.5" />
        {assembly && wide ? (
          <IconButton label={treeOpen ? t('studio.tree.hide') : t('studio.tree.show')} aria-pressed={treeOpen} onClick={() => setTreeOpen((open) => !open)} className="aria-pressed:bg-accent-soft aria-pressed:text-accent">
            <PanelLeft aria-hidden className="size-4.5" />
          </IconButton>
        ) : null}
        {wide ? (
          <IconButton label={panelOpen ? t('studio.panel.hide') : t('studio.panel.show')} aria-pressed={panelOpen} onClick={() => setPanelOpen((open) => !open)} className="aria-pressed:bg-accent-soft aria-pressed:text-accent">
            <PanelRight aria-hidden className="size-4.5" />
          </IconButton>
        ) : null}
      </div>
    </>
  )

  const steps = outline !== null && isolated !== null ? pathNames(outline, isolated, nameOf) : []
  const overlay = studioReady ? (
    <>
      {selectedNode !== null ? (
        <SelectionBar
          node={selectedNode}
          name={nameOf(selectedNode)}
          hidden={hidden.has(selectedNode.path)}
          isolated={isolated === selectedNode.path}
          onIsolate={() => go({ node: selectedNode.path })}
          onToggleHidden={() => toggleHidden(selectedNode.path)}
          onClear={() => setSelected(null)}
        />
      ) : null}
      {isolated !== null ? <PathBar steps={steps} onGo={(path) => go({ node: path })} /> : null}
    </>
  ) : null

  const mainArea = preparing ? (
    <section aria-label={loaded.name} className={cx('relative grid place-items-center overflow-hidden bg-canvas', wide ? 'h-full' : 'h-[min(62dvh,600px)] min-h-72 rounded-lg')}>
      {thumbnail ? <img src={thumbnail} alt="" className="absolute inset-0 size-full object-contain opacity-50" /> : null}
      <p role="status" className="relative flex items-center gap-3 rounded-lg bg-canvas/92 px-4 py-3 text-md text-canvas-text">
        <Loader2 aria-hidden className="size-4.5 shrink-0 text-brand motion-safe:animate-spin" />
        <span>{t('viewer.preparing')}</span>
        <span className="sr-only">{t('viewer.preparingLabel', { name: loaded.name })}</span>
      </p>
    </section>
  ) : hasViewer ? (
    <>
      {showFolder && outline !== null ? (
        <FolderView
          outline={outline}
          nameOf={nameOf}
          level={levelOf(outline, node)}
          wide={wide}
          selected={selected}
          hidden={hidden}
          onLevel={(path) => go({ node: path })}
          onOpen3d={(path) => go({ view: null, node: path === '0' ? null : path })}
          onShowInAssembly={(path) => {
            setSelected(path)
            go({ view: null, node: null })
          }}
          onCopyLink={copyLink}
          onToggleHidden={toggleHidden}
          onShowAll={showAll}
          thumbnail={drawThumbnail}
          thumbnails={thumbnails}
        />
      ) : null}
      <Suspense fallback={<ViewerFallback src={thumbnail} fill={wide} />}>
        <Viewer
          key={`${loaded.id}:${loaded.currentVersion.number}`}
          name={loaded.name}
          extension={loaded.extension}
          size={loaded.size}
          url={modelUrl(loaded.id)}
          thumbnailUrl={thumbnail}
          start={start}
          source={model.kind === 'derivative' ? 'derivative' : 'source'}
          modelBytes={model.bytes}
          maxConvertBytes={model.maxConvertBytes}
          retryAlways={storesDerivative && derivative?.state === 'failed'}
          onDerivative={storesDerivative || rebuilds ? (glb, stats) => saveDerivative(loaded.id, loaded.currentVersion.number, loaded.extension, glb, stats) : undefined}
          onConvertFailed={storesDerivative || rebuilds ? (code) => recordFailure(loaded.id, loaded.currentVersion.number, code) : undefined}
          rebuildUrl={rebuilds ? contentUrl(loaded.id) : undefined}
          onThumbnail={!loaded.thumbnailAvailable && can.edit && format !== null && canMakeThumbnail(format, loaded.size, phone, model.maxConvertBytes) ? (blob) => saveThumbnail(loaded.id, loaded.currentVersion.number, blob) : undefined}
          onUploadVersion={can.edit && uploads.allowed ? () => uploads.pick(loaded.id) : undefined}
          downloadAction={
            <Button onClick={() => startDownload(loaded.id)}>
              <Download aria-hidden className="size-4.5" />
              {t('file.download')}
            </Button>
          }
          studio={studio}
          frameClassName={wide ? 'h-full' : undefined}
          overlay={overlay}
          hidden={showFolder}
          toolbarStart={
            assembly && !wide ? (
              <Button variant="ghost" aria-pressed={sheet !== null} onClick={() => setSheet(sheet === null && outline !== null ? { level: levelOf(outline, isolated) } : null)} className="aria-pressed:bg-accent-soft aria-pressed:text-accent" {...(studioReady ? {} : { disabledReason: t('viewer.tool.notReady') })}>
                <ListTree aria-hidden className="size-4.5" />
                {t('studio.view.parts')}
              </Button>
            ) : null
          }
        />
      </Suspense>
    </>
  ) : (
    <section aria-label={loaded.name} className="m-4 grid justify-items-center gap-4 rounded-lg border border-line bg-surface p-4 app:m-6 app:p-8">
      {thumbnail ? (
        <img src={thumbnail} alt={t('file.preview.alt', { name: loaded.name })} className="max-h-110 w-full max-w-160 rounded-md bg-canvas object-contain" />
      ) : (
        <div className="grid justify-items-center gap-3 py-10">
          <FileTile ext={tileText(loaded.extension)} className="size-20 text-sm" />
          <p className="text-md text-text-2">{t('file.preview.none')}</p>
        </div>
      )}
      <p className="max-w-md text-center text-sm text-text-3">{noModelText(t, loaded)}</p>
    </section>
  )

  const selectionCard = selectedNode !== null && !showFolder ? (
    <section aria-label={t('studio.selected', { name: nameOf(selectedNode) })} className="mb-5 grid gap-3 rounded-lg border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Box aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="break-words text-md font-semibold">{nameOf(selectedNode)}</p>
          <p className="text-sm text-text-2">{selectedNode.children.length > 0 ? counted(t, locale, 'studio.kind.assembly', selectedNode.parts) : t('studio.kind.part')}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-base">
        <dt className="text-text-3">{t('studio.sel.path')}</dt>
        <dd className="min-w-0 break-words">{outline === null ? '' : pathNames(outline, selectedNode.path, nameOf).map((step) => step.name).join(' › ')}</dd>
        {(() => {
          const size = api.current?.sizeOf(selectedNode.path)
          return size ? (
            <>
              <dt className="text-text-3">{t('studio.sel.size')}</dt>
              <dd className="tabular-nums">{formatSize(size, locale)}</dd>
            </>
          ) : null
        })()}
      </dl>
      <div className="flex flex-wrap gap-2">
        {isolated === selectedNode.path ? (
          <Button onClick={() => go({ node: null })}>{t('studio.path.whole')}</Button>
        ) : (
          <Button onClick={() => go({ node: selectedNode.path })}>{t('studio.isolate')}</Button>
        )}
        <Button onClick={() => toggleHidden(selectedNode.path)} aria-pressed={hidden.has(selectedNode.path)}>
          {hidden.has(selectedNode.path) ? t('studio.show') : t('studio.hide')}
        </Button>
        <Button variant="ghost" onClick={() => copyLink(selectedNode.path)}>
          {t('studio.copyLink')}
        </Button>
      </div>
      <p className="text-sm text-text-2">{isolated !== null ? t('studio.backHint') : t('studio.local')}</p>
    </section>
  ) : null

  const panel = (
    <section aria-label={t('file.tabs.label')} className="min-w-0">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t('file.tabs.label')}>
          <TabsTrigger value="details">{t('file.tabs.details')}</TabsTrigger>
          <TabsTrigger value="comments">{t('file.tabs.comments')}</TabsTrigger>
          <TabsTrigger value="activity">{t('file.tabs.activity')}</TabsTrigger>
          <TabsTrigger value="versions">{t('file.tabs.versions')}</TabsTrigger>
        </TabsList>
        <div className="pt-4">
          <TabsContent value="details">
            {stale ? <p className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-base text-warn-text">{t('studio.stale')}</p> : null}
            {selectionCard}
            <Details file={loaded} outline={studioReady ? outline : null} />
            {showFolder ? (
              <div className="mt-5 grid gap-1.5">
                <h3 className="text-base font-semibold">{t('studio.about.title')}</h3>
                <p className="text-sm text-text-2">{t('studio.about.lead')}</p>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="comments">
            <CommentsTab workspaceId={active.id} fileId={loaded.id} can={can} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab workspaceId={active.id} fileId={loaded.id} can={can} />
          </TabsContent>
          <TabsContent value="versions">
            <VersionsTab
              workspaceId={active.id}
              fileId={loaded.id}
              can={can}
              reloadKey={versionKey}
              onRestored={() => {
                void load()
                setVersionKey((key) => key + 1)
              }}
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )

  const showTree = studioReady && wide && treeOpen && !showFolder && outline !== null
  const showPanel = !wide || panelOpen

  return (
    <Frame bar={bar} sub={assembly && !wide ? viewSwitch('row') : undefined}>
      <div
        className={cx(
          'flex-1 app:grid app:min-h-0',
          showTree && showPanel ? 'app:grid-cols-[288px_minmax(0,1fr)_360px]'
            : showTree ? 'app:grid-cols-[288px_minmax(0,1fr)]'
            : showPanel ? 'app:grid-cols-[minmax(0,1fr)_360px]'
            : 'app:grid-cols-1',
        )}
      >
        {showTree && outline !== null ? (
          <TreePanel
            outline={outline}
            nameOf={nameOf}
            selected={selected}
            isolated={isolated}
            hidden={hidden}
            onSelect={setSelected}
            onToggleHidden={toggleHidden}
            onShowAll={showAll}
            onClose={() => setTreeOpen(false)}
          />
        ) : null}
        <main id="main" tabIndex={-1} className={cx('min-w-0 outline-none', wide ? 'h-full min-h-0' : 'px-3 pt-3', !hasViewer && !preparing && 'overflow-y-auto')}>
          {mainArea}
        </main>
        {showPanel ? <aside className="min-w-0 px-4 pb-26 pt-4 app:h-full app:overflow-y-auto app:border-l app:border-line app:px-5 app:pb-8">{panel}</aside> : null}
      </div>

      {sheet !== null && outline !== null && !wide ? (
        <section aria-label={t('studio.tree.label')} className="fixed inset-x-0 bottom-0 z-30 flex max-h-[58dvh] flex-col rounded-t-xl border-t border-line bg-bg shadow-pop">
          <div className="flex items-center gap-2 px-4 pt-3">
            <h2 className="text-lg font-semibold">{t('studio.tree.title')}</h2>
            <span className="text-sm text-text-3">{number(outline.parts)}</span>
            <IconButton label={t('studio.sheet.close')} className="ml-auto" onClick={() => setSheet(null)}>
              <X aria-hidden className="size-5" />
            </IconButton>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 pb-6 pt-2">
            <PartsList
              outline={outline}
              nameOf={nameOf}
              level={sheet.level}
              onLevel={(level) => setSheet({ level })}
              selected={selected}
              hidden={hidden}
              onActivate={(picked) => setSelected(picked.path)}
              onToggleHidden={toggleHidden}
              onShowAll={showAll}
            />
          </div>
        </section>
      ) : null}

      {renaming ? (
        <RenameDialog
          key={loaded.id}
          file={loaded}
          workspaceId={active.id}
          onClose={() => setRenaming(false)}
          onRenamed={(name) => {
            setState({ status: 'ready', file: { ...loaded, name } })
            toast({ title: t('files.rename.done', { name }), tone: 'success' })
            setRenaming(false)
          }}
        />
      ) : null}
      {moving ? (
        <MoveDialog
          files={[loaded]}
          workspaceId={active.id}
          onClose={() => setMoving(false)}
          onMoved={() => {
            toast({ title: t('files.move.done', { name: loaded.name }), tone: 'success' })
            setMoving(false)
            void load()
          }}
        />
      ) : null}
      {sharing && can.share ? <ShareDialog file={loaded} workspaceId={active.id} onClose={() => setSharing(false)} /> : null}
    </Frame>
  )
}
