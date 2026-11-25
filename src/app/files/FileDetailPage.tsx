import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
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
import { failureKey } from '../errors'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'
import { RenameDialog } from './FileDialogs'
import { FileMenu } from './FileMenu'
import { ActivityTab, CommentsTab, VersionsTab } from './FileTabs'
import { startDownload } from './download'
import { formatBytes, formatDateTime, tileText } from './format'
import { ShareDialog } from './ShareDialog'
import { abilitiesOf, isFullView, type AnyFileView } from './types'
import { useUploads } from './UploadProvider'

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

/** The file page (docs/03 §2.5, D18): thumbnail or file card with a download until the viewer arrives in Faz 5, and the tabbed panel. */
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
  const [sharing, setSharing] = useState(search.share === true)
  const [tab, setTab] = useState('details')
  const [versionKey, setVersionKey] = useState(0)

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
                onMove: () => toast({ title: t('files.reason.moveNoProject') }),
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
        <section aria-label={file.name} className="grid justify-items-center gap-4 rounded-lg border border-line bg-surface p-4 app:p-8">
          {file.thumbnailAvailable ? (
            <img src={`/api/files/${file.id}/thumbnail?v=${file.currentVersion.number}`} alt={t('file.preview.alt', { name: file.name })} className="max-h-110 w-full max-w-160 rounded-md bg-canvas object-contain" />
          ) : (
            <div className="grid justify-items-center gap-3 py-10">
              <FileTile ext={tileText(file.extension)} className="size-20 text-sm" />
              <p className="text-md text-text-2">{t('file.preview.none')}</p>
            </div>
          )}
          <p className="max-w-md text-center text-sm text-text-3">{t('file.preview.note')}</p>
        </section>

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
      {sharing && can.share ? <ShareDialog file={file} workspaceId={active.id} onClose={() => setSharing(false)} /> : null}
    </>
  )
}
