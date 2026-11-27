import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { Box, ChevronLeft, Download, FileDown, FileQuestion, LayoutGrid, Loader2, Paintbrush, PanelLeft, PanelRight, Share2, X } from 'lucide-react'
import { MenuItem } from '#/components/ui/Menu'
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
import { chainOf, findNode, isNodePath, isUnder, levelOf, namePaths, outlineShape, type OutlineNode } from '#/viewer/tree/outline'
import type { PinMark } from '#/viewer/tools/types'
import type { CommentView, PendingPin } from '#/shared/fileViews'
import { editNode, hiddenOf, looksOf, matchPrevious, namesOf, type SceneEdit } from '#/viewer/tree/scene'
import type { ViewerApi } from '#/viewer/Viewer.client'
import { converterOf, ERROR_CODES, formatOfExtension, isConvertFormat, type ErrorCode, type Stats } from '#/viewer/worker/protocol'
import { reportDerivativeFailure, uploadDerivative } from './derivative'
import { failureKey } from '../errors'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'
import { MoveDialog, RenameDialog } from './FileDialogs'
import { FileMenu } from './FileMenu'
import { ActivityTab, CommentsTab, useComments, VersionsTab, type CommentPins } from './FileTabs'
import { startDownload } from './download'
import { formatBytes, formatDateTime, tileText } from './format'
import { ShareDialog } from './ShareDialog'
import { uploadThumbnail } from './thumbnail'
import { abilitiesOf, contentUrl, isFullView, modelUrl, thumbnailUrl, type AnyFileView } from './types'
import { type UploadItem, UploadPill, useUploads } from './UploadProvider'
import { FolderView } from './studio/FolderView'
import { baseName, counted, formatSize, makeNamer, pathNames } from './studio/names'
import { CanvasTool, PathBar, SelectionBar } from './studio/Overlays'
import { PartsList } from './studio/PartsList'
import { hiddenOn, initialStudio, studioReducer } from './studio/state'
import { createThumbnailStore } from './studio/thumbnails'
import { TreePanel } from './studio/TreePanel'
import { useWide } from './studio/useWide'
import { useScene } from './studio/useScene'
import { Chip, ConflictBar, EditBar, MatchBar, NodeEditor, SaveState, UnsavedBar } from './studio/SceneEdit'
import { StlDialog } from './studio/StlDialog'
import { desktopOnlyIcons, GestureHints, StudioToolbar, ToolCard, ToolHint } from './studio/Tools'
import { useTools } from './studio/useTools'
import { SavedViews } from './studio/SavedViews'
import type { SceneView } from '#/shared/scene'
import { EMPTY_SCENE } from '#/shared/scene'

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

  // The studio: the open model's outline and what this screen does with it (B2: my hide/show is never saved), in one
  // reducer.
  const [studioState, dispatch] = useReducer(studioReducer, null, initialStudio)
  const { outline, ready: modelReady, selected, sheet, editing, stlPath, matchDismissed } = studioState
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
  // version moved on meanwhile (the server refuses that too). The page keeps showing the model it has (`file.model`
  // stays, so the viewer does not reopen); the scene record is read again, since a model with a stored GLB may now be
  // edited (and offer an earlier version's colours). `sceneReload` is set once the scene hook has run.
  const sceneReload = useRef<() => void>(() => {})
  const saveDerivative = useCallback((fileId: string, version: number, extension: string, glb: ArrayBuffer, stats: Stats) => {
    const format = formatOfExtension(extension)
    const pending = shown.current.uploading.some((item) => item.targetFileId === fileId && (item.status === 'queued' || item.status === 'uploading'))
    const still = () => shown.current.file?.id === fileId && shown.current.file.currentVersion.number === version
    if (format === null || pending || !still()) return
    void uploadDerivative({ fileId, version, glb, stats, converter: converterOf(format) }).then((result) => {
      if (result === 'ready' && still()) sceneReload.current()
    })
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
  const nodeParam = search.node
  const node = outline !== null && nodeParam !== undefined && findNode(outline, nodeParam) !== null ? nodeParam : null
  const stale = outline !== null && nodeParam !== undefined && node === null
  const partsView = search.view === 'parts'
  const isolated = !partsView && node !== null && node !== '0' ? node : null
  // Comment pins (docs/11 §4.3, B3): the comments live here so the canvas can draw their pins.
  const comments = useComments(active.id, id)
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [showPins, setShowPins] = useState(true)
  const [pinsFor, setPinsFor] = useState(modelKey)
  if (pinsFor !== modelKey) {
    setPinsFor(modelKey)
    setPendingPin(null)
    setActiveComment(null)
  }
  // Section, measure, screenshot (Faz 5d): per open model; the section's range fits the isolated part.
  const tools = useTools(api, modelKey, wide, isolated, (pin) => {
    setPendingPin({ path: pin.path, point: pin.point, version: shownFile?.currentVersion.number ?? 0 })
    setActiveComment(null)
    setTab('comments')
    setPanelOpen(true)
  })
  const shownVersion = shownFile?.currentVersion.number ?? 0
  const pinsOpen = modelReady && outline !== null
  // Pins of this version on parts this model has, numbered in comment order; the one being written comes last.
  const pinNumbers = useMemo(() => {
    const numbers = new Map<string, number>()
    if (outline === null) return numbers
    for (const comment of comments.items ?? [])
      if (comment.parentId === null && !comment.deleted && comment.anchor !== null && comment.versionNumber === shownVersion && findNode(outline, comment.anchor.path) !== null)
        numbers.set(comment.id, numbers.size + 1)
    return numbers
  }, [comments.items, outline, shownVersion])
  const marks = useMemo<PinMark[]>(() => {
    const out: PinMark[] = []
    if (showPins)
      for (const comment of comments.items ?? []) {
        const number = pinNumbers.get(comment.id)
        if (number !== undefined && comment.anchor !== null) out.push({ id: comment.id, label: String(number), path: comment.anchor.path, point: comment.anchor.point, active: comment.id === activeComment })
      }
    if (pendingPin !== null) out.push({ id: '', label: String(pinNumbers.size + 1), path: pendingPin.path, point: pendingPin.point, active: true })
    return out
  }, [comments.items, pinNumbers, showPins, pendingPin, activeComment])
  const wantPins = pinsOpen && marks.length > 0
  const ensureTools = tools.ensure
  useEffect(() => {
    if (wantPins) ensureTools()
  }, [wantPins, ensureTools])
  const liveTools = tools.tools
  useEffect(() => {
    liveTools?.pins.set(pinsOpen ? marks : [])
  }, [liveTools, marks, pinsOpen])
  useEffect(
    () =>
      liveTools?.pins.onSelect((commentId) => {
        setActiveComment(commentId)
        setTab('comments')
        setPanelOpen(true)
      }),
    [liveTools],
  )
  useEffect(() => () => thumbnails.clear(), [modelKey, thumbnails])
  // The scene record (docs/11 §3): applied for everyone who sees the 3D model, written in scene prep.
  // Read again when the stored model changes (the GLB stored: kind and size); not while Preparing (no model open).
  const scene = useScene(
    id,
    shownFile?.currentVersion.number ?? 0,
    shownFile === null ? '' : `${shownFile.model.kind}:${shownFile.model.bytes ?? 0}`,
    shownFile !== null && shownFile.model.kind !== 'none' && !preparingModel,
    undefined,
    // Told by the app's toast (above the page): also when the save fails after the person left the file page.
    () => toast({ title: t('studio.save.lost'), tone: 'danger' }),
  )
  sceneReload.current = scene.reload
  const sceneHidden = useMemo(() => hiddenOf(scene.body), [scene.body])
  const looks = useMemo(() => looksOf(scene.body), [scene.body])
  const renamed = useMemo(() => namesOf(scene.body), [scene.body])
  // Folder thumbnails show the record's colours: drawn again after a change.
  useEffect(() => thumbnails.clear(), [looks, thumbnails])
  const { localHidden, localShown } = studioState
  const hidden = useMemo(() => hiddenOn({ localHidden, localShown }, sceneHidden), [localHidden, localShown, sceneHidden])
  // Isolating a hidden node shows it again (the viewer draws it anyway: an isolated node is never blank). Only when the
  // isolation starts: hiding the isolated node leaves the isolation (`toggleHidden`), and in between it must stay hidden.
  const isolatedHidden = isolated !== null && hidden.has(isolated)
  const unhidFor = useRef<string | null>(null)
  // Not handled before the scene record is read (or failed to): a record hiding the node may still come after the tree.
  const sceneRead = scene.read
  useEffect(() => {
    if (unhidFor.current === isolated) return
    if (isolated !== null && !sceneRead) return
    unhidFor.current = isolated
    if (isolated !== null && isolatedHidden) dispatch({ type: 'toggleHidden', path: isolated, hiddenNow: true })
  }, [isolated, isolatedHidden, sceneRead])
  // In scene prep the selection is not tinted: the editor must see the colour being chosen.
  const tinted = editing ? null : selected
  const view = useMemo<StudioView>(() => ({ selected: tinted, isolated, hidden, looks }), [tinted, isolated, hidden, looks])
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
  // Hiding the isolated node (or one above it) would change nothing on the canvas (the isolated node always draws):
  // it leaves the isolation, so the hide shows.
  const leaveIsolationFor = useCallback((path: string) => {
    if (isolated !== null && isUnder(isolated, path)) go({ node: null })
  }, [isolated, go])
  const toggleHidden = useCallback(
    (path: string) => {
      const hiding = !hidden.has(path)
      dispatch({ type: 'toggleHidden', path, hiddenNow: !hiding })
      if (hiding) leaveIsolationFor(path)
    },
    [hidden, leaveIsolationFor],
  )
  const showAll = useCallback(() => dispatch({ type: 'showAll', sceneHidden }), [sceneHidden])
  const setStlPath = useCallback((path: string | null) => dispatch({ type: 'stl', path }), [])
  const setEditing = useCallback((on: boolean) => dispatch({ type: 'editing', editing: on }), [])
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
  const stlSource = useMemo(
    () => ({
      triangles: (path: string) => api.current?.triangles(path) ?? Promise.resolve(0),
      write: (path: string, centered: boolean, name: string) => api.current?.exportStl(path, centered, name) ?? Promise.resolve(null),
    }),
    [],
  )
  const drawThumbnail = useCallback((path: string, width: number, height: number) => api.current?.thumbnail(path, width, height) ?? Promise.resolve(null), [])

  const file = state.status === 'ready' ? state.file : null
  const nameOf = useMemo(() => makeNamer(baseName(file?.name ?? ''), t('studio.unnamed'), renamed), [file?.name, t, renamed])
  const names = useMemo(() => (outline === null ? null : namePaths(outline)), [outline])
  // §3.3: an earlier model's record, carried over by name path, offered to an editor on a desktop.
  const match = useMemo(
    () => (outline !== null && scene.answer?.previous && scene.answer.scene === null && scene.answer.canEdit ? matchPrevious(scene.answer.previous.body, outline) : null),
    [outline, scene.answer],
  )
  const editNodeLook = useCallback(
    (path: string, edit: SceneEdit) => {
      if (edit.hidden !== undefined) dispatch({ type: 'forget', path })
      scene.change(editNode(scene.body, path, edit, names?.get(path)))
      if (edit.hidden === true) leaveIsolationFor(path)
    },
    [scene, names, leaveIsolationFor],
  )

  // One sheet at a time on a phone: a tool card and the parts list replace each other. The folder view closes a card.
  const openTool = tools.open
  useEffect(() => {
    if (tools.tool !== null) setSheet(null)
  }, [tools.tool, setSheet])
  useEffect(() => {
    if (sheet !== null) openTool(null)
  }, [sheet, openTool])
  const folderShown = search.view === 'parts'
  useEffect(() => {
    if (folderShown) openTool(null)
  }, [folderShown, openTool])

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

  // Selection, scene prep and STL work on any open model (a single part too); the tree and Parts view need an assembly.
  const modelOpen = hasViewer && modelReady && outline !== null
  const editReason = !wide ? t('studio.edit.desktop') : !can.edit ? t('studio.edit.noPermission') : scene.answer?.canEdit ? null : t('studio.edit.notReady')
  const stlReason = !wide ? t('studio.stl.desktop') : !can.download ? t('studio.stl.noPermission') : null
  // The earlier colours are offered first: editing would replace the record they would be applied to.
  const offering = match !== null && wide && !matchDismissed && modelOpen
  const isEditing = editing && editReason === null && modelOpen && !offering
  const blocked = scene.status === 'conflict' || scene.status === 'version'
  const stlButton = (path: string) => (
    <Button onClick={() => setStlPath(path)} {...(stlReason === null ? {} : { disabledReason: stlReason })}>
      <FileDown aria-hidden className="size-4.5" />
      {t('studio.stl.open')}
    </Button>
  )
  const steps = outline !== null && isolated !== null ? pathNames(outline, isolated, nameOf) : []
  // Saved views (docs/11 §3.1): applied by everyone who sees the model, saved on a desktop by an editor.
  const views = scene.body.views
  const maxViews = scene.answer?.maxViews ?? 20
  const viewReason = !wide ? t('views.saveDesktop')
    : !can.edit ? t('views.noPermission')
    : !scene.answer?.canEdit ? t('studio.edit.notReady')
    : blocked ? t('studio.conflict.title')
    : offering ? t('studio.edit.answerMatch')
    : views.length >= maxViews ? t('views.limit', { count: maxViews })
    : null
  const saveView = (name: string) => {
    void tools.snapshot().then((shot) => {
      if (shot === null) return
      const view: SceneView = {
        id: crypto.randomUUID(),
        name,
        camera: shot.camera,
        ...(hidden.size > 0 ? { hidden: [...hidden] } : {}),
        ...(shot.section === undefined ? {} : { section: shot.section }),
      }
      scene.change({ ...scene.body, views: [...scene.body.views, view] }, true)
    })
  }
  const applyView = (view: SceneView) => {
    void tools.applyView(view)
    dispatch({ type: 'viewHidden', hidden: new Set(view.hidden ?? []), sceneHidden })
    // A view hides what it hid: an isolation that would hide the rest is left.
    if (isolated !== null) go({ node: null })
  }
  const savedViews = modelOpen && !showFolder ? (
    <SavedViews
      views={views}
      onApply={applyView}
      saving={wide && can.edit ? { reason: viewReason, onSave: saveView, onDelete: (viewId) => scene.change({ ...scene.body, views: views.filter((v) => v.id !== viewId) }, true) } : undefined}
    />
  ) : null
  const pinHidden = (path: string) => chainOf(path).some((step) => hidden.has(step)) || (isolated !== null && !isUnder(path, isolated))
  const commentPins: CommentPins | undefined = modelOpen
    ? {
        version: loaded.currentVersion.number,
        numberOf: (comment: CommentView) => pinNumbers.get(comment.id) ?? null,
        where: (path: string) => (outline === null || findNode(outline, path) === null ? null : pathNames(outline, path, nameOf).map((step) => step.name).join(' › ')),
        hidden: pinHidden,
        onShow: (path: string) => {
          for (const step of chainOf(path)) if (hidden.has(step)) dispatch({ type: 'toggleHidden', path: step, hiddenNow: true })
          if (isolated !== null && !isUnder(path, isolated)) go({ node: null })
        },
        active: activeComment,
        onActivate: (comment: CommentView) => {
          setActiveComment(comment.id)
          if (comment.anchor !== null) setSelected(comment.anchor.path)
        },
        pending: pendingPin,
        pendingNumber: pinNumbers.size + 1,
        placing: tools.tool === 'pin',
        onPlace: () => tools.open('pin'),
        onClear: () => setPendingPin(null),
        show: showPins,
        onShowChange: setShowPins,
      }
    : undefined
  const endName = (path: string | null) => (outline === null || path === null ? '' : nameOf(findNode(outline, path) ?? outline))
  const overlay = modelOpen ? (
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
          extra={
            stlReason === null ? (
              <CanvasTool label={t('studio.stl.open')} onClick={() => setStlPath(selectedNode.path)}>
                <FileDown aria-hidden className="size-4.5" />
              </CanvasTool>
            ) : null
          }
        />
      ) : null}
      {isolated !== null && tools.tool !== 'measure' && tools.tool !== 'pin' ? <PathBar steps={steps} onGo={(path) => go({ node: path })} /> : null}
      {wide ? (
        <ToolCard tools={tools} wide fileName={loaded.name} nameOf={endName} below={selectedNode !== null} pins={marks.length > 0} onSaveView={viewReason === null ? () => saveView(t('views.default', { number: views.length + 1 })) : undefined} />
      ) : (
        <GestureHints />
      )}
      {tools.tool === 'measure' || tools.tool === 'pin' ? <ToolHint wide={wide} tool={tools.tool} /> : null}
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
          menuExtra={(item) => (
            <MenuItem icon={<FileDown />} onSelect={() => setStlPath(item.path)} {...(stlReason === null ? {} : { disabledReason: stlReason })}>
              {t('studio.stl.open')}
            </MenuItem>
          )}
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
          toolbar={(controls) => (
            <StudioToolbar
              controls={controls}
              wide={wide}
              tools={tools}
              pins={can.comment && modelOpen}
              savedViews={modelOpen ? views.map((view) => ({ id: view.id, name: view.name, onApply: () => applyView(view) })) : undefined}
              parts={
                assembly && !wide
                  ? {
                      open: sheet !== null,
                      onToggle: () => setSheet(sheet === null && outline !== null ? { level: levelOf(outline, isolated) } : null),
                      disabledReason: studioReady ? undefined : t('viewer.tool.notReady'),
                    }
                  : undefined
              }
              desktopOnly={
                wide
                  ? undefined
                  : [
                      { key: 'edit', label: t('studio.edit.open'), icon: desktopOnlyIcons.edit, reason: can.edit ? t('studio.edit.desktop') : t('studio.edit.noPermission') },
                      { key: 'stl', label: t('studio.stl.open'), icon: desktopOnlyIcons.stl, reason: can.download ? t('studio.stl.desktop') : t('studio.stl.noPermission') },
                    ]
              }
            />
          )}
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
        <dt className="text-text-3">{t('studio.sel.color')}</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {(() => {
            const own = looks.get(selectedNode.path)?.color
            return own ? (
              <>
                <Chip color={own} className="size-4" />
                {t('studio.sel.fromScene', { color: own.toUpperCase() })}
              </>
            ) : (
              t('studio.sel.fromFile')
            )
          })()}
        </dd>
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
        {stlButton(selectedNode.path)}
        <Button variant="ghost" onClick={() => copyLink(selectedNode.path)}>
          {t('studio.copyLink')}
        </Button>
      </div>
      <p className="text-sm text-text-2">{isolated !== null ? t('studio.backHint') : t('studio.local')}</p>
    </section>
  ) : null

  // The appearance: everyone sees the record applied; an editor on a desktop opens scene prep from here (docs/11 §4.2).
  const appearance = modelOpen && !showFolder ? (
    <section className="mb-5 grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('studio.view.label')}</h3>
        <Button variant={editReason === null ? 'secondary' : 'ghost'} onClick={() => setEditing(true)} {...(editReason === null && !blocked && !offering ? {} : { disabledReason: editReason ?? (blocked ? t('studio.conflict.title') : t('studio.edit.answerMatch')) })}>
          <Paintbrush aria-hidden className="size-4.5" />
          {t('studio.edit.open')}
        </Button>
      </div>
      <p className="text-sm text-text-2">{editReason !== null && !wide ? editReason : t('studio.local')}</p>
    </section>
  ) : null

  const editPanel = isEditing ? (
    <section aria-label={t('studio.edit.title')} className="grid gap-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t('studio.edit.title')}</h2>
        <span className="ml-auto">
          <SaveState status={scene.status} />
        </span>
      </div>
      {selectedNode === null ? (
        <p className="text-base text-text-2">{t('studio.edit.pick')}</p>
      ) : (
        <>
          <div className="min-w-0">
            <p className="break-words text-md font-semibold">{nameOf(selectedNode)}</p>
            <p className="text-sm text-text-2">{outline === null ? '' : pathNames(outline, selectedNode.path, nameOf).map((step) => step.name).join(' › ')}</p>
          </div>
          <NodeEditor
            node={selectedNode}
            entry={scene.body.nodes[selectedNode.path]}
            fileColor={api.current?.colorOf(selectedNode.path) ?? null}
            onEdit={(edit) => editNodeLook(selectedNode.path, edit)}
          />
        </>
      )}
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
            {appearance}
            {savedViews}
            <Details file={loaded} outline={studioReady ? outline : null} />
            {showFolder ? (
              <div className="mt-5 grid gap-1.5">
                <h3 className="text-base font-semibold">{t('studio.about.title')}</h3>
                <p className="text-sm text-text-2">{t('studio.about.lead')}</p>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="comments">
            <CommentsTab comments={comments} can={can} pins={commentPins} />
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

  const bars = (
    <>
      {scene.status === 'conflict' || scene.status === 'version' ? (
        <ConflictBar kind={scene.status} onReload={() => (scene.status === 'version' ? window.location.reload() : scene.reload())} />
      ) : isEditing ? (
        <EditBar status={scene.status} onDone={() => setEditing(false)} />
      ) : offering ? (
        <MatchBar
          version={scene.answer?.previous?.versionNumber ?? null}
          matched={match!.matched}
          unmatched={match!.unmatched}
          busy={scene.status === 'saving'}
          onApply={() => scene.change(match!.body, true)}
          onIgnore={() => {
            dispatch({ type: 'dismissMatch' })
            scene.change(EMPTY_SCENE, true)
          }}
        />
      ) : scene.status === 'error' || scene.status === 'tooLarge' ? (
        <UnsavedBar status={scene.status} onRetry={scene.retry} />
      ) : null}
    </>
  )

  const showTree = studioReady && wide && treeOpen && !showFolder && outline !== null
  const showPanel = !wide || panelOpen || isEditing

  return (
    <Frame bar={bar} sub={assembly && !wide ? viewSwitch('row') : undefined}>
      {bars}
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
        {showPanel ? <aside className="min-w-0 px-4 pb-26 pt-4 app:h-full app:overflow-y-auto app:border-l app:border-line app:px-5 app:pb-8">{editPanel ?? panel}</aside> : null}
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

      {!wide && modelOpen && !showFolder ? <ToolCard tools={tools} wide={false} fileName={loaded.name} nameOf={endName} /> : null}

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
      {stlPath !== null && outline !== null && stlReason === null ? (
        <StlDialog
          path={stlPath}
          name={nameOf(findNode(outline, stlPath) ?? outline)}
          where={pathNames(outline, stlPath, nameOf).map((step) => step.name).join(' › ')}
          source={stlSource}
          onClose={() => setStlPath(null)}
          onFailed={() => toast({ title: t('studio.stl.failed'), tone: 'danger' })}
        />
      ) : null}
      {sharing && can.share ? <ShareDialog file={loaded} workspaceId={active.id} onClose={() => setSharing(false)} /> : null}
    </Frame>
  )
}
