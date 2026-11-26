/**
 * The 3D viewer (docs/11 §1, docs/03 §2.2): canvas, loading/error states (§8) and the toolbar under the canvas. Entry of
 * the lazy viewer chunk: three.js is loaded only through this file, never during SSR. The scene lives in a ref; React
 * state is the pure `viewerReducer`.
 */
import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { Axis3d, Camera, Cuboid, Focus, Grid3x3, Loader2 } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { cx } from '#/components/ui/cx'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '#/components/ui/Menu'
import { fileTypeOfExtension } from '#/shared/fileTypes'
import { useI18n, type I18nKey } from '#/i18n'
import { download, parseInWorker } from './pipeline'
import { buildModel } from './scene/build'
import { createScene, WebGlUnavailable, type SceneHandle } from './scene/createScene'
import { VIEW_NAMES, type ViewName } from './scene/fit'
import { edgesAvailable, errorActions, errorTextKey, initialViewerState, viewerReducer, type LoadStage, type ViewerState } from './state'
import { formatOfExtension } from './worker/protocol'

export type ViewerProps = {
  /** File name: canvas label and screenshot name. */
  readonly name: string
  readonly extension: string
  /** Where the model bytes come from (`/api/files/{id}/content?v=current` in 5a). */
  readonly url: string
  /** Shown in place of the canvas until the model is drawn, and behind error texts. */
  readonly thumbnailUrl: string | null
  /** Phone rule (docs/11 §2.5): STEP/IGES wait for the person to start them. */
  readonly deferred: boolean
  /** The caller may store a thumbnail and the file has none: the Worker renders one while parsing. */
  readonly onThumbnail?: ((blob: Blob) => void) | undefined
  /** `edit` permission: a broken file offers "Upload new version". */
  readonly onUploadVersion?: (() => void) | undefined
  /** The page's download button, repeated next to error texts when the caller may download. */
  readonly downloadAction?: ReactNode
}

const viewKey: Record<ViewName, I18nKey> = { iso: 'viewer.view.iso', front: 'viewer.view.front', top: 'viewer.view.top', right: 'viewer.view.right' }

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const baseName = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

const StageText = ({ stage, ratio, format }: { stage: LoadStage; ratio: number | null; format: string }) => {
  const { t } = useI18n()
  switch (stage) {
    case 'download':
      return <>{ratio === null ? t('viewer.stage.downloadUnknown') : t('viewer.stage.download', { percent: Math.round(ratio * 100) })}</>
    case 'convert':
      return <>{t('viewer.stage.convert', { format })}</>
    case 'parse':
      return <>{t('viewer.stage.parse')}</>
    case 'thumbnail':
      return <>{t('viewer.stage.thumbnail')}</>
    case 'build':
      return <>{t('viewer.stage.build')}</>
  }
}

/** The panel over the thumbnail while the canvas is not ready. Texts sit on the canvas colour (13.5:1, docs/03 §5). */
const StatusPanel = ({ state, format, onCancel, onStart, onUploadVersion, downloadAction }: {
  state: ViewerState
  format: string
  onCancel: () => void
  onStart: () => void
  onUploadVersion?: (() => void) | undefined
  downloadAction?: ReactNode
}) => {
  const { t } = useI18n()
  const phase = state.phase
  if (phase.status === 'ready') return null
  const actions = (children: ReactNode) => <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
  let body: ReactNode
  if (phase.status === 'loading')
    body = (
      <>
        <div className="flex items-center gap-3">
          {phase.ratio === null ? <Loader2 aria-hidden className="size-4.5 shrink-0 text-brand motion-safe:animate-spin" /> : null}
          <p className="min-w-0 flex-1 text-md">
            <StageText stage={phase.stage} ratio={phase.ratio} format={format} />
          </p>
          <Button variant="secondary" onClick={onCancel}>
            {t('viewer.cancel')}
          </Button>
        </div>
        {phase.ratio === null ? null : <progress data-ui="progress" className="block w-full" max={1} value={phase.ratio} aria-label={t('viewer.progress')} />}
      </>
    )
  else if (phase.status === 'idle')
    body =
      phase.reason === 'phone' ? (
        <>
          <p className="text-md font-medium">{t('viewer.phone')}</p>
          <p className="text-base opacity-85">{t('viewer.phoneLead', { format })}</p>
          {actions(
            <>
              <Button variant="secondary" onClick={onStart}>
                {t('viewer.phoneOpen')}
              </Button>
              {downloadAction}
            </>,
          )}
        </>
      ) : (
        <>
          <p className="text-md">{t('viewer.canceled')}</p>
          {actions(
            <Button variant="secondary" onClick={onStart}>
              {t('viewer.open')}
            </Button>,
          )}
        </>
      )
  else {
    const can = errorActions(phase.code)
    body = (
      <>
        <p className="text-md">{t(errorTextKey(phase.code))}</p>
        {actions(
          <>
            {can.retry ? (
              <Button variant="secondary" onClick={onStart}>
                {t('viewer.retry')}
              </Button>
            ) : null}
            {can.newVersion && onUploadVersion ? (
              <Button variant="secondary" onClick={onUploadVersion}>
                {t('viewer.uploadVersion')}
              </Button>
            ) : null}
            {downloadAction}
          </>,
        )}
      </>
    )
  }
  return (
    <div className="absolute inset-x-3 bottom-3 mx-auto grid max-w-120 gap-2 rounded-lg bg-canvas/92 p-3 text-canvas-text app:bottom-5 app:p-4" role="status" aria-live="polite">
      {body}
    </div>
  )
}

const Viewer = ({ name, extension, url, thumbnailUrl, deferred, onThumbnail, onUploadVersion, downloadAction }: ViewerProps) => {
  const { t, locale } = useI18n()
  const [state, dispatch] = useReducer(viewerReducer, deferred, initialViewerState)
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<SceneHandle | null>(null)
  const cancelJob = useRef<(() => void) | null>(null)
  const thumbnailSink = useRef(onThumbnail)
  thumbnailSink.current = onThumbnail
  const format = formatOfExtension(extension)
  const label = fileTypeOfExtension(extension)?.label ?? extension.toUpperCase()
  const ready = state.phase.status === 'ready'
  const canvasLabel = t('viewer.canvas', { name })

  // The scene: one renderer per mounted viewer, disposed on unmount (docs/11 §6).
  useEffect(() => {
    if (!host.current) return
    try {
      scene.current = createScene(host.current, canvasLabel)
    } catch (error) {
      if (error instanceof WebGlUnavailable) dispatch({ type: 'fail', code: 'webgl' })
      else throw error
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
    // The label is set once; a language switch while the viewer is open keeps the first text until the next open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One load per attempt: download → Worker → three objects. Leaving the page or Cancel stops both.
  useEffect(() => {
    if (state.attempt === 0 || scene.current === null) return
    if (format === null) return dispatch({ type: 'fail', code: 'unsupported' })
    const controller = new AbortController()
    let stop: (() => void) | null = () => controller.abort()
    cancelJob.current = () => stop?.()
    void (async () => {
      // One render per whole percent, not per network chunk.
      let shown = -2
      const fetched = await download(url, controller.signal, (ratio) => {
        const step = ratio === null ? -1 : Math.floor(ratio * 100)
        if (step === shown) return
        shown = step
        dispatch({ type: 'progress', stage: 'download', ratio })
      })
      if (controller.signal.aborted) return
      if (!fetched.ok) return dispatch({ type: 'fail', code: 'network' })
      const job = parseInWorker({
        format,
        name,
        bytes: fetched.bytes,
        thumbnail: thumbnailSink.current !== undefined,
        onProgress: (stage, ratio) => dispatch({ type: 'progress', stage, ratio }),
      })
      stop = job.cancel
      const outcome = await job.result
      if (!outcome.ok) {
        if (outcome.code !== 'canceled') dispatch({ type: 'fail', code: outcome.code })
        return
      }
      dispatch({ type: 'progress', stage: 'build', ratio: null })
      const handle = scene.current
      if (handle === null) return
      handle.setModel(buildModel(outcome.model), outcome.stats)
      dispatch({ type: 'ready', stats: outcome.stats })
      if (outcome.thumbnail !== null) thumbnailSink.current?.(outcome.thumbnail)
    })()
    return () => {
      stop?.()
      stop = null
      cancelJob.current = null
    }
  }, [state.attempt, url, format, name])

  useEffect(() => {
    if (ready) scene.current?.setWireframe(state.wireframe)
  }, [ready, state.wireframe])
  useEffect(() => {
    if (ready) scene.current?.setEdges(state.edges)
  }, [ready, state.edges])

  const stats = state.phase.status === 'ready' ? state.phase.stats : null
  const notReady = ready ? {} : { disabledReason: t('viewer.tool.notReady') }
  const pressed = 'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent'
  const number = (n: number) => n.toLocaleString(locale)

  return (
    <section aria-label={t('viewer.region')} className="grid min-w-0 gap-2">
      <div className="relative h-[min(62dvh,600px)] min-h-72 overflow-hidden rounded-lg bg-canvas">
        <div ref={host} className={cx('size-full', !ready && 'invisible')} />
        {ready ? null : (
          <>
            {thumbnailUrl ? <img src={thumbnailUrl} alt="" className={cx('absolute inset-0 size-full object-contain', state.phase.status === 'error' && 'opacity-50')} /> : null}
            <StatusPanel
              state={state}
              format={label}
              onCancel={() => {
                cancelJob.current?.()
                dispatch({ type: 'cancel' })
              }}
              onStart={() => dispatch({ type: 'start' })}
              onUploadVersion={onUploadVersion}
              downloadAction={downloadAction}
            />
          </>
        )}
      </div>

      <div role="toolbar" aria-label={t('viewer.toolbar')} className="flex flex-wrap items-center gap-1">
        <IconButton label={t('viewer.tool.fit')} onClick={() => scene.current?.fit()} {...notReady}>
          <Focus aria-hidden className="size-4.5" />
        </IconButton>
        {ready ? (
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={t('viewer.tool.views')}>
                <Axis3d aria-hidden className="size-4.5" />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="start" className="min-w-44">
              {VIEW_NAMES.map((view) => (
                <MenuItem key={view} onSelect={() => scene.current?.view(view)}>
                  {t(viewKey[view])}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : (
          <IconButton label={t('viewer.tool.views')} {...notReady}>
            <Axis3d aria-hidden className="size-4.5" />
          </IconButton>
        )}
        <IconButton label={t('viewer.tool.wireframe')} aria-pressed={state.wireframe} className={pressed} onClick={() => dispatch({ type: 'toggleWireframe' })} {...notReady}>
          <Grid3x3 aria-hidden className="size-4.5" />
        </IconButton>
        <IconButton
          label={t('viewer.tool.edges')}
          aria-pressed={state.edges}
          className={pressed}
          onClick={() => dispatch({ type: 'toggleEdges' })}
          {...(ready && !edgesAvailable(state) ? { disabledReason: t('viewer.tool.edgesTooLarge') } : notReady)}
        >
          <Cuboid aria-hidden className="size-4.5" />
        </IconButton>
        <IconButton
          label={t('viewer.tool.screenshot')}
          onClick={() => {
            void scene.current?.screenshot().then((blob) => {
              if (blob) saveBlob(blob, `${baseName(name)}.png`)
            })
          }}
          {...notReady}
        >
          <Camera aria-hidden className="size-4.5" />
        </IconButton>
        {stats ? (
          <p className="ml-auto hidden text-sm text-text-3 app:block">
            {stats.parts === 1 ? t('viewer.statsOne', { triangles: number(stats.triangles) }) : t('viewer.stats', { triangles: number(stats.triangles), parts: number(stats.parts) })}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export default Viewer
