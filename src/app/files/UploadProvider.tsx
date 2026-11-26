import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { ChevronDown, ChevronUp, UploadCloud, X } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { FileTile } from '#/components/ui/DataList'
import { Meter } from '#/components/ui/Meter'
import { acceptedExtensions, extensionOf, supportedTypesText } from '#/shared/fileTypes'
import { useI18n, type I18nKey } from '#/i18n'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'
import { formatBytes, tileText } from './format'
import { canMakeThumbnail, isPhone, readDeviceHints } from '#/viewer/device'
import { converterOf, formatOfExtension, isConvertFormat, type Stats } from '#/viewer/worker/protocol'
import { reportDerivativeFailure, uploadDerivative } from './derivative'
import { uploadThumbnail } from './thumbnail'
import type { UploadedFile } from './types'
import { createThumbnailQueue } from './thumbnailQueue'
import { runUpload, xhrPut, type Put, type UploadFailureReason } from './upload'

export type UploadItem = {
  readonly id: number
  readonly file: File
  readonly name: string
  readonly status: 'queued' | 'uploading' | 'done' | 'error'
  readonly progress: number
  readonly reason?: UploadFailureReason
  readonly fileId?: string
  readonly targetFileId?: string
  readonly projectId?: string
}

type Uploads = {
  readonly items: readonly UploadItem[]
  /** The role may upload; the picker, the drop zone and the buttons follow it. */
  readonly allowed: boolean
  readonly pick: (targetFileId?: string) => void
  readonly start: (files: readonly File[], targetFileId?: string) => void
  /** Where new files (not new versions) go: a project page sets its project while it is open. */
  readonly setProject: (projectId: string | undefined) => void
  /** Counts finished uploads and thumbnails or derivatives stored after them: pages reload their lists when it changes. */
  readonly finished: number
  /** Files whose GLB derivative is being made in this tab right now (the card shows "Preparing"). */
  readonly preparing: ReadonlySet<string>
}

/** What a finished upload's Worker job hands to the store step. */
type AfterUpload = {
  readonly version: number
  readonly thumbnail: Blob | null
  readonly derivative: { readonly glb: ArrayBuffer; readonly stats: Stats; readonly converter: string } | null
}

const Ctx = createContext<Uploads | null>(null)

/** Makes uploads started while the calling page is open land in this project. */
export const useUploadProject = (projectId: string | undefined) => {
  const { setProject } = useUploads()
  useEffect(() => {
    setProject(projectId)
    return () => setProject(undefined)
  }, [setProject, projectId])
}

export const useUploads = (): Uploads => {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useUploads must be used inside <UploadProvider>')
  return ctx
}

const CONCURRENCY = 2

/** The parse Worker's main-thread side, client only: the server build never bundles the Worker. */
const loadPipeline = createClientOnlyFn(() => import('#/viewer/pipeline'))

/** Development fixture: a presigned URL of `/__fixture/…` is answered in memory with a short progress run. */
const fixturePut: Put = ({ signal, onProgress }) =>
  new Promise((resolve, reject) => {
    let step = 0
    const timer = setInterval(() => {
      if (signal.aborted) {
        clearInterval(timer)
        return reject(new DOMException('Upload canceled', 'AbortError'))
      }
      step += 1
      onProgress(step / 5)
      if (step >= 5) {
        clearInterval(timer)
        resolve({ status: 200, etag: '"fixture"' })
      }
    }, 350)
  })

const defaultPut: Put = (request) => (import.meta.env.DEV && request.url.startsWith('/__fixture/') ? fixturePut(request) : xhrPut(request))

const reasonKey: Record<UploadFailureReason, I18nKey> = {
  unsupported: 'upload.error.unsupported',
  empty: 'upload.error.empty',
  invalidName: 'upload.error.invalidName',
  tooLarge: 'upload.error.tooLarge',
  quota: 'upload.error.quota',
  limit: 'upload.error.limit',
  denied: 'upload.error.denied',
  versionType: 'upload.error.versionType',
  conflict: 'upload.error.conflict',
  network: 'upload.error.network',
  rejected: 'upload.error.rejected',
  failed: 'upload.error.failed',
}

const retryable = (reason: UploadFailureReason | undefined) => reason === 'network' || reason === 'conflict' || reason === 'failed' || reason === 'rejected'

const UploadRow = ({ item, preparing, onCancel, onRetry }: { item: UploadItem; preparing: boolean; onCancel: () => void; onRetry: () => void }) => {
  const { t, locale } = useI18n()
  const percent = Math.round(item.progress * 100)
  return (
    <li className="grid gap-1.5 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <FileTile ext={tileText(extensionOf(item.name) || '?')} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-md font-medium">{item.name}</div>
          {item.status === 'done' ? (
            <div className="text-sm text-success">
              {t('upload.done', { size: formatBytes(item.file.size, locale) })}
              {preparing ? <span className="text-text-3"> · {t('viewer.preparing')}</span> : null}
            </div>
          ) : item.status === 'error' ? (
            <div className="text-sm font-medium text-danger">{t('upload.failed')}</div>
          ) : (
            <div className="text-sm text-text-3">{item.status === 'queued' ? t('upload.queued') : `${percent}%`}</div>
          )}
        </div>
        {item.status === 'done' && item.fileId ? (
          <Link to="/app/files/$id" params={{ id: item.fileId }} className="rounded-sm px-1 py-2 text-md font-medium text-accent hover:text-accent-hover">
            {t('upload.open')}
          </Link>
        ) : null}
        {item.status === 'uploading' || item.status === 'queued' ? (
          <IconButton label={t('upload.cancel', { name: item.name })} size="sm" onClick={onCancel}>
            <X aria-hidden className="size-4" />
          </IconButton>
        ) : null}
      </div>
      {item.status === 'uploading' || item.status === 'queued' ? <Meter value={item.progress} max={1} label={item.name} valueText={`${percent}%`} tone="brand" /> : null}
      {item.status === 'error' && item.reason ? (
        <div className="grid justify-items-start gap-1.5">
          <p className="text-sm text-text-2">{t(reasonKey[item.reason], { name: item.name, types: supportedTypesText })}</p>
          {retryable(item.reason) ? (
            <Button onClick={onRetry} className="h-9 text-base">
              {t('upload.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

const UploadCard = ({ items, preparing, onCancel, onRetry, onDismiss }: { items: readonly UploadItem[]; preparing: ReadonlySet<string>; onCancel: (id: number) => void; onRetry: (id: number) => void; onDismiss: () => void }) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const done = items.filter((item) => item.status === 'done').length
  const busy = items.some((item) => item.status === 'uploading' || item.status === 'queued')
  const title = busy ? t('upload.progressTitle', { done, total: items.length }) : done === items.length ? t('upload.allDone', { count: done }) : t('upload.finishedTitle', { done, total: items.length })
  return (
    <section aria-label={t('upload.region')} className="fixed inset-x-3 bottom-20 z-30 max-h-[60dvh] overflow-hidden rounded-lg border border-line bg-bg shadow-pop app:inset-x-auto app:bottom-6 app:right-6 app:w-96">
      <header className="flex items-center gap-1 px-4 py-1.5">
        <h2 aria-live="polite" className="min-w-0 flex-1 truncate text-md font-medium">
          {title}
        </h2>
        <IconButton label={open ? t('upload.collapse') : t('upload.expand')} size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronDown aria-hidden className="size-4.5" /> : <ChevronUp aria-hidden className="size-4.5" />}
        </IconButton>
        {busy ? null : (
          <IconButton label={t('common.close')} size="sm" onClick={onDismiss}>
            <X aria-hidden className="size-4.5" />
          </IconButton>
        )}
      </header>
      {open ? (
        <ul className="max-h-[calc(60dvh-48px)] overflow-y-auto border-t border-line">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} preparing={item.fileId !== undefined && preparing.has(item.fileId)} onCancel={() => onCancel(item.id)} onRetry={() => onRetry(item.id)} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/** Holds the upload queue for the whole signed-in app, so an upload keeps running while the person browses. */
export const UploadProvider = ({ children, put = defaultPut }: { children: ReactNode; put?: Put }) => {
  const { t } = useI18n()
  const { call } = useSession()
  const { active } = useWorkspace()
  const [items, setItems] = useState<readonly UploadItem[]>([])
  const [finished, setFinished] = useState(0)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pickTarget = useRef<string | undefined>(undefined)
  const projectRef = useRef<string | undefined>(undefined)
  const controllers = useRef(new Map<number, AbortController>())
  const nextId = useRef(1)
  const allowed = active.role === 'owner' || active.role === 'admin' || active.role === 'member'
  const workspaceId = active.id

  // After an upload (docs/11 §2.5, desktop), from the bytes already in hand, one job at a time in the parse Worker:
  // STEP/IGES/3MF are converted once and their GLB derivative and thumbnail (one scene) are stored; STL/OBJ/PLY get
  // a thumbnail. The Worker code loads only now. A newer version of the same file (started or finished) drops older
  // jobs, and the server refuses a result for a version that is no longer current, so nothing lands on the wrong one.
  // Phones convert nothing (memory, battery): the first desktop open does it. A source over `maxConvertBytes` is
  // recorded as `too_large` without being read.
  const [jobs] = useState(() =>
    createThumbnailQueue<AfterUpload>(async (fileId, result) => {
      const glb = result.derivative === null ? null : await uploadDerivative({ fileId, version: result.version, ...result.derivative })
      const image = result.thumbnail === null ? false : await uploadThumbnail(fileId, result.version, result.thumbnail)
      return glb === 'ready' || image
    }, () => setFinished((count) => count + 1)),
  )
  const [preparing, setPreparing] = useState<ReadonlySet<string>>(() => new Set())
  const mark = useCallback((fileId: string, on: boolean) => setPreparing((current) => {
    if (current.has(fileId) === on) return current
    const next = new Set(current)
    if (on) next.add(fileId)
    else next.delete(fileId)
    return next
  }), [])
  const queueAfterUpload = useCallback((uploaded: UploadedFile, file: File) => {
    const { fileId, versionNumber: version, maxConvertBytes } = uploaded
    const format = formatOfExtension(extensionOf(file.name))
    const phone = isPhone(readDeviceHints())
    if (format === null) return jobs.supersede(fileId)
    if (isConvertFormat(format)) {
      if (phone) return jobs.supersede(fileId)
      if (file.size > maxConvertBytes) {
        jobs.supersede(fileId)
        void reportDerivativeFailure({ fileId, version, code: 'too_large' }).then(() => setFinished((count) => count + 1))
        return
      }
      mark(fileId, true)
      void jobs.enqueue(fileId, async () => {
        const [{ deriveInWorker }, bytes] = await Promise.all([loadPipeline(), file.arrayBuffer()])
        const outcome = await deriveInWorker({ format, name: file.name, bytes, maxConvertBytes }).result
        if (outcome.ok) return { version, thumbnail: outcome.thumbnail, derivative: { glb: outcome.glb, stats: outcome.stats, converter: converterOf(format) } }
        if (outcome.code !== 'canceled') await reportDerivativeFailure({ fileId, version, code: outcome.code })
        return null
      }).finally(() => mark(fileId, false))
      return
    }
    if (!canMakeThumbnail(format, file.size, phone)) return jobs.supersede(fileId)
    void jobs.enqueue(fileId, async () => {
      const [{ thumbnailInWorker }, bytes] = await Promise.all([loadPipeline(), file.arrayBuffer()])
      const outcome = await thumbnailInWorker({ format, name: file.name, bytes }).result
      return outcome.ok ? { version, thumbnail: outcome.blob, derivative: null } : null
    })
  }, [jobs, mark])

  const update = useCallback((id: number, change: Partial<UploadItem>) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item))), [])

  const run = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController()
      controllers.current.set(item.id, controller)
      update(item.id, { status: 'uploading', progress: 0 })
      // A new version is on its way: a thumbnail still being made from the previous one must not be posted.
      if (item.targetFileId !== undefined) jobs.supersede(item.targetFileId)
      const outcome = await runUpload({
        call,
        put,
        workspaceId,
        file: item.file,
        ...(item.targetFileId === undefined ? {} : { targetFileId: item.targetFileId }),
        ...(item.projectId === undefined ? {} : { projectId: item.projectId }),
        signal: controller.signal,
        onProgress: (progress) => update(item.id, { progress }),
      })
      controllers.current.delete(item.id)
      if (outcome.ok) {
        update(item.id, { status: 'done', progress: 1, fileId: outcome.file.fileId })
        setFinished((count) => count + 1)
        queueAfterUpload(outcome.file, item.file)
      } else if (outcome.canceled) setItems((current) => current.filter((entry) => entry.id !== item.id))
      else update(item.id, { status: 'error', reason: outcome.reason })
    },
    [call, put, workspaceId, update, queueAfterUpload, jobs],
  )

  // Starts queued items while fewer than CONCURRENCY run.
  useEffect(() => {
    const running = items.filter((item) => item.status === 'uploading').length
    const next = items.filter((item) => item.status === 'queued' && !controllers.current.has(item.id)).slice(0, Math.max(0, CONCURRENCY - running))
    for (const item of next) {
      controllers.current.set(item.id, new AbortController())
      void run(item)
    }
  }, [items, run])

  const start = useCallback(
    (files: readonly File[], targetFileId?: string) => {
      if (!allowed || files.length === 0) return
      const added = files.map((file): UploadItem => ({ id: nextId.current++, file, name: file.name, status: 'queued', progress: 0, ...(targetFileId === undefined ? {} : { targetFileId }), ...(targetFileId === undefined && projectRef.current !== undefined ? { projectId: projectRef.current } : {}) }))
      setItems((current) => [...current, ...added])
    },
    [allowed],
  )

  const cancel = useCallback(
    (id: number) => {
      const controller = controllers.current.get(id)
      if (controller && !controller.signal.aborted) controller.abort()
      setItems((current) => current.filter((item) => item.id !== id || item.status === 'uploading'))
    },
    [],
  )

  const setProject = useCallback((projectId: string | undefined) => {
    projectRef.current = projectId
  }, [])

  const retry = useCallback((id: number) => update(id, { status: 'queued', progress: 0 }), [update])

  const pick = useCallback((targetFileId?: string) => {
    pickTarget.current = targetFileId
    if (input.current) {
      input.current.multiple = targetFileId === undefined
      input.current.click()
    }
  }, [])

  // Whole-window drop zone (docs/03 §2.1).
  useEffect(() => {
    if (!allowed) return
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth += 1
      setDragging(true)
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      start(Array.from(event.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [allowed, start])

  // Leaving the page would stop the uploads that are still running, or a conversion (docs/11 §2.5: only while it runs).
  const busy = items.some((item) => item.status === 'uploading' || item.status === 'queued') || preparing.size > 0
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  const value = useMemo<Uploads>(() => ({ items, allowed, pick, start, setProject, finished, preparing }), [items, allowed, pick, start, setProject, finished, preparing])

  return (
    <Ctx value={value}>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        aria-label={t('upload.input')}
        accept={acceptedExtensions.join(',')}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          start(files, pickTarget.current)
        }}
      />
      {items.length > 0 ? <UploadCard items={items} preparing={preparing} onCancel={cancel} onRetry={retry} onDismiss={() => setItems([])} /> : null}
      {dragging ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-scrim p-6">
          <div className="grid justify-items-center gap-2 rounded-xl bg-bg px-8 py-7 text-center shadow-pop">
            <UploadCloud className="size-8 text-accent" />
            <p className="text-lg font-heading">{t('upload.drop')}</p>
            <p className="text-sm text-text-3">{supportedTypesText}</p>
          </div>
        </div>
      ) : null}
    </Ctx>
  )
}
