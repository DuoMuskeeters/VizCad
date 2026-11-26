import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { Download, FileQuestion, Share2 } from 'lucide-react'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { Button } from '#/components/ui/Button'
import { EmptyState } from '#/components/ui/EmptyState'
import { FileTile } from '#/components/ui/DataList'
import { InlineAlert } from '#/components/ui/Notice'
import { PageHeader } from '#/components/ui/PageHeader'
import { Skeleton } from '#/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/Tabs'
import { useToast } from '#/components/ui/Toast'
import { fileTypeOfExtension } from '#/shared/fileTypes'
import { useI18n } from '#/i18n'
import { canMakeThumbnail, deferOpen, isPhone, readDeviceHints } from '#/viewer/device'
import type { ViewerStart } from '#/viewer/state'
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
import { abilitiesOf, isFullView, modelUrl, thumbnailUrl, type AnyFileView } from './types'
import { type UploadItem, useUploads } from './UploadProvider'

/** The viewer chunk (three.js) loads only here, on the client: the server build never sees it (app routes have no SSR). */
const loadViewer = createClientOnlyFn(() => import('#/viewer/Viewer.client'))
const Viewer = lazy(loadViewer)

/** What the viewer area shows while its chunk loads: the thumbnail on the canvas colour, like the viewer's own loading state. */
const ViewerFallback = ({ src }: { src: string | null }) => (
  <div className="grid min-w-0 gap-2">
    <div className="relative h-[min(62dvh,600px)] min-h-72 overflow-hidden rounded-lg bg-canvas">
      {src ? <img src={src} alt="" className="absolute inset-0 size-full object-contain" /> : null}
    </div>
    <div className="h-11 app:h-9.5" />
  </div>
)

/** The code a failed derivative stored; an unknown one reads as "could not be read". */
const storedCode = (code: string | null): ErrorCode => ERROR_CODES.find((known) => known === code) ?? 'corrupt'

/**
 * Why there is no 3D for this caller (docs/11 §8): no derivative yet (only an edit user's desktop open makes one), too
 * large, a failed conversion, or (only download is missing) the old "view only" note.
 */
const noModelText = (t: ReturnType<typeof useI18n>['t'], file: AnyFileView) => {
  const derivative = file.model.derivative
  if (fileTypeOfExtension(file.extension) === undefined) return t('file.preview.note')
  if (derivative?.state === 'too_large') return t('viewer.error.tooLarge', { size: `${Math.round(file.model.maxConvertBytes / (1024 * 1024))} MB` })
  if (derivative?.state === 'failed') {
    const code = storedCode(derivative.code)
    return t(code === 'empty' ? 'viewer.error.empty' : code === 'timeout' || code === 'out_of_memory' ? 'viewer.error.device' : code === 'too_complex' ? 'viewer.error.tooComplex' : 'viewer.error.corrupt')
  }
  return t('viewer.notPrepared')
}

type State = { readonly status: 'loading' } | { readonly status: 'missing' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly file: AnyFileView }

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt className="text-base text-text-3">{label}</dt>
    <dd className="min-w-0 break-words text-base">{children}</dd>
  </>
)

const Details = ({ file }: { file: AnyFileView }) => {
  const { t, locale } = useI18n()
  const label = fileTypeOfExtension(file.extension)?.label ?? file.extension.toUpperCase()
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 py-1">
      <Row label={t('file.details.format')}>{label}</Row>
      <Row label={t('file.details.size')}>{formatBytes(file.size, locale)}</Row>
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
 * The file page (docs/03 §2.5, D18, D23): the 3D viewer whenever `model` has something for this caller (every level for
 * a GLB derivative or an STL/OBJ/PLY; a STEP/IGES/3MF source only with download, converted in place and, for an edit
 * user on a desktop, stored as the derivative); otherwise the thumbnail or file card with the reason; and the tabbed panel.
 */
export const FileDetailPage = () => {
  const { t, locale } = useI18n()
  const { call, expire } = useSession()
  const { active } = useWorkspace()
  const { toast } = useToast()
  const navigate = useNavigate()
  const uploads = useUploads()
  const { id } = useParams({ strict: false }) as { id: string }
  const search = useSearch({ strict: false }) as { share?: boolean }
  const [state, setState] = useState<State>({ status: 'loading' })
  const [renaming, setRenaming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [sharing, setSharing] = useState(search.share === true)
  const [tab, setTab] = useState('details')
  const [versionKey, setVersionKey] = useState(0)
  const phone = useMemo(() => isPhone(readDeviceHints()), [])

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

  // A new version finished uploading: the file card and the version list change.
  useEffect(() => {
    if (uploads.finished > 0) {
      void load()
      setVersionKey((key) => key + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads.finished])

  if (state.status === 'loading')
    return (
      <div role="status" aria-busy="true" aria-label={t('file.loading')} className="grid gap-4">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="grid gap-6 app:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    )
  if (state.status === 'missing')
    return (
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
    )
  if (state.status === 'error')
    return (
      <InlineAlert title={t('file.error.title')} action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}>
        {t('files.error.lead')}
      </InlineAlert>
    )

  const file = state.file
  const can = abilitiesOf(file)
  const typeLabel = fileTypeOfExtension(file.extension)?.label ?? file.extension.toUpperCase()
  const format = formatOfExtension(file.extension)
  const thumbnail = file.thumbnailAvailable ? thumbnailUrl(file.id, file.currentVersion.number) : null
  const model = file.model
  const derivative = model.derivative
  const converts = format !== null && isConvertFormat(format)
  // Edit + download on a desktop, reading the source: the viewer converts it and the GLB is stored (lazy path, §2.5).
  const storesDerivative = converts && model.kind === 'source' && can.edit && can.download && !phone
  const start: ViewerStart = !converts || model.kind !== 'source' ? 'auto'
    : derivative?.state === 'too_large' ? { failed: 'too_large' }
    : derivative?.state === 'failed' ? { failed: storedCode(derivative.code) }
    : format !== null && deferOpen(format, phone) ? 'phone'
    : 'auto'
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('file.back'), href: '/app' }]}
        linkAs={({ href, className, children }) => (
          <Link to="/app" href={href} className={className}>
            {children}
          </Link>
        )}
        title={<span className="break-all">{file.name}</span>}
        subtitle={`${typeLabel} · ${formatBytes(file.size, locale)}`}
        actions={
          <>
            <Button onClick={() => startDownload(file.id)} {...(can.download ? {} : { disabledReason: t('files.reason.download') })}>
              <Download aria-hidden className="size-4.5" />
              {t('file.download')}
            </Button>
            <Button variant="primary" onClick={() => setSharing(true)} {...(can.share ? {} : { disabledReason: t('files.reason.share') })}>
              <Share2 aria-hidden className="size-4.5" />
              {t('file.share')}
            </Button>
            <FileMenu
              file={file}
              handlers={{
                onRename: () => setRenaming(true),
                onStar: () => {
                  if (!isFullView(file)) return
                  const next = !file.starred
                  setState({ status: 'ready', file: { ...file, starred: next } })
                  void call(next ? 'starFile' : 'unstarFile', { workspaceId: active.id, fileId: file.id }).then((result) => {
                    if (!result.ok) {
                      setState({ status: 'ready', file })
                      toast({ title: t('files.star.error'), tone: 'danger' })
                    }
                  })
                },
                onMove: () => setMoving(true),
                onShare: () => setSharing(true),
                onDownload: () => startDownload(file.id),
                onTrash: () => {
                  void call('trashFile', { workspaceId: active.id, fileId: file.id }).then((result) => {
                    if (!result.ok) return toast({ title: t(failureKey(result)), tone: 'danger' })
                    toast({ title: t('file.trashed', { name: file.name }) })
                    void navigate({ to: '/app' })
                  })
                },
              }}
            />
          </>
        }
      />

      <div className="grid items-start gap-6 app:grid-cols-[minmax(0,1fr)_380px]">
        {model.kind !== 'none' && format !== null ? (
          <Suspense fallback={<ViewerFallback src={thumbnail} />}>
            <Viewer
              key={`${file.id}:${file.currentVersion.number}`}
              name={file.name}
              extension={file.extension}
              size={file.size}
              url={modelUrl(file.id)}
              thumbnailUrl={thumbnail}
              start={start}
              source={model.kind}
              modelBytes={model.bytes}
              maxConvertBytes={model.maxConvertBytes}
              retryAlways={storesDerivative && derivative?.state === 'failed'}
              onDerivative={storesDerivative ? (glb, stats) => saveDerivative(file.id, file.currentVersion.number, file.extension, glb, stats) : undefined}
              onConvertFailed={storesDerivative ? (code) => recordFailure(file.id, file.currentVersion.number, code) : undefined}
              onThumbnail={!file.thumbnailAvailable && can.edit && canMakeThumbnail(format, file.size, phone, model.maxConvertBytes) ? (blob) => saveThumbnail(file.id, file.currentVersion.number, blob) : undefined}
              onUploadVersion={can.edit && uploads.allowed ? () => uploads.pick(file.id) : undefined}
              downloadAction={
                <Button onClick={() => startDownload(file.id)}>
                  <Download aria-hidden className="size-4.5" />
                  {t('file.download')}
                </Button>
              }
            />
          </Suspense>
        ) : (
          <section aria-label={file.name} className="grid justify-items-center gap-4 rounded-lg border border-line bg-surface p-4 app:p-8">
            {thumbnail ? (
              <img src={thumbnail} alt={t('file.preview.alt', { name: file.name })} className="max-h-110 w-full max-w-160 rounded-md bg-canvas object-contain" />
            ) : (
              <div className="grid justify-items-center gap-3 py-10">
                <FileTile ext={tileText(file.extension)} className="size-20 text-sm" />
                <p className="text-md text-text-2">{t('file.preview.none')}</p>
              </div>
            )}
            <p className="max-w-md text-center text-sm text-text-3">{noModelText(t, file)}</p>
          </section>
        )}

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
                <Details file={file} />
              </TabsContent>
              <TabsContent value="comments">
                <CommentsTab workspaceId={active.id} fileId={file.id} can={can} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityTab workspaceId={active.id} fileId={file.id} can={can} />
              </TabsContent>
              <TabsContent value="versions">
                <VersionsTab
                  workspaceId={active.id}
                  fileId={file.id}
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
      </div>

      {renaming ? (
        <RenameDialog
          key={file.id}
          file={file}
          workspaceId={active.id}
          onClose={() => setRenaming(false)}
          onRenamed={(name) => {
            setState({ status: 'ready', file: { ...file, name } })
            toast({ title: t('files.rename.done', { name }), tone: 'success' })
            setRenaming(false)
          }}
        />
      ) : null}
      {moving ? (
        <MoveDialog
          files={[file]}
          workspaceId={active.id}
          onClose={() => setMoving(false)}
          onMoved={() => {
            toast({ title: t('files.move.done', { name: file.name }), tone: 'success' })
            setMoving(false)
            void load()
          }}
        />
      ) : null}
      {sharing && can.share ? <ShareDialog file={file} workspaceId={active.id} onClose={() => setSharing(false)} /> : null}
    </>
  )
}
