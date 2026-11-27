/**
 * The 3D viewer (docs/11 §1, docs/03 §2.2): canvas, loading/error states (§8) and the toolbar under the canvas. Entry of
 * the lazy viewer chunk: three.js is loaded only through this file, never during SSR. The scene lives in a ref; React
 * state is the pure `viewerReducer`.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Axis3d, Camera, Cuboid, Focus, Grid3x3, Loader2 } from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { cx } from '#/components/ui/cx'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '#/components/ui/Menu'
import { fileTypeOfExtension } from '#/shared/fileTypes'
import { useI18n, type I18nKey } from '#/i18n'
import { formatBytes } from '#/app/files/format'
import { download, GLB_CONTENT_TYPE, parseInWorker } from './pipeline'
import { buildModel } from './scene/build'
import { createScene, WebGlUnavailable, type SceneHandle } from './scene/createScene'
import { VIEW_NAMES, type ViewName } from './scene/fit'
import type { StudioView } from './scene/studio'
import type { OutlineNode } from './tree/outline'
import type { ToolsApi } from './tools/types'
import {
  edgesAvailable, errorActions, errorTextKey, initialViewerState, viewerReducer, type LoadStage, type ViewerError, type ViewerStart, type ViewerState,
} from './state'
import { classifyError, formatOfExtension, isConvertFormat, ParseFailure, type ErrorCode, type Stats } from './worker/protocol'

/** GLTFLoader loads only when `model` answers with a GLB; a source file never pulls it in. */
const loadGlbModule = () => import('./scene/loadGlb')
/** The STL writer loads only when someone downloads a part (B7). */
const loadStlModule = () => import('./scene/stl')
/** Section, measure and screenshot (Faz 5d) load the first time a tool opens. */
const loadTools = () => import('./tools/tools')

/** What the page may ask the open model (docs/11 §4): no three.js object leaves the viewer. */
export type ViewerApi = {
  /** A small PNG of one node on its own; only while the canvas is hidden (folder view), else it would flicker. */
  readonly thumbnail: (path: string, width: number, height: number) => Promise<Blob | null>
  /** World size of a node in model units (mm unless the file says otherwise). */
  readonly sizeOf: (path: string) => readonly [number, number, number] | null
  readonly triangles: (path: string) => Promise<number>
  /** A node's colour in the file (before the scene record), `#rrggbb`. */
  readonly colorOf: (path: string) => string | null
  /** Binary STL of a node (B7): in its place in the assembly, or centred on the origin. */
  readonly exportStl: (path: string, centered: boolean, name: string) => Promise<Blob | null>
  /** The section, measure and screenshot tools (Faz 5d): a lazy chunk, loaded on first use; null without a scene. Rejects when the chunk does not load (tried again on the next call). */
  readonly tools: () => Promise<ToolsApi | null>
  /** The camera to a standard view of the whole model, fitted. */
  readonly view: (name: ViewName) => void
}

/** What a page's own toolbar works with (`toolbar`): the viewer keeps the state, the page draws the buttons. */
export type ViewerControls = {
  readonly ready: boolean
  readonly stats: Stats | null
  readonly wireframe: boolean
  readonly edges: boolean
  readonly edgesAvailable: boolean
  readonly fit: () => void
  readonly view: (name: ViewName) => void
  readonly toggleWireframe: () => void
  readonly toggleEdges: () => void
}

/** The assembly studio (docs/11 §4.2): the page owns selection, isolation, hidden nodes and looks; the viewer applies them. */
export type ViewerStudio = {
  readonly view: StudioView
  readonly onOutline: (outline: OutlineNode | null) => void
  readonly onPick: (path: string | null) => void
  readonly api: RefObject<ViewerApi | null>
  /** Ready, or not (the page shows the folder view only over an open model). */
  readonly onReady?: ((ready: boolean) => void) | undefined
}

/** The conversion limit in whole binary megabytes, as the plan states it ("50 MB"). */
const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

export type ViewerProps = {
  /** File name: canvas label and screenshot name. */
  readonly name: string
  readonly extension: string
  /** Bytes of the source: STEP/IGES/3MF over `maxConvertBytes` are refused before anything is downloaded (§2.5). */
  readonly size: number
  /** Where the model bytes come from: `/api/files/{id}/model` or `/s/{token}/model` (audited as a preview, docs/11 §2.4). */
  readonly url: string
  /** Shown in place of the canvas until the model is drawn, and behind error texts. */
  readonly thumbnailUrl: string | null
  /**
   * How the viewer starts (`state.ts`): `auto`; `phone` for a STEP/IGES source on a phone; `tap` for the mobile shared
   * page ("Open 3D · N MB"); `{ failed }` for a derivative that failed before.
   */
  readonly start: ViewerStart
  /**
   * What `model` answers (the file view's `model.kind`): a GLB derivative needs no Worker; a source is parsed in it.
   * Read once per mount: a page reload that finds the GLB stored meanwhile must not restart the open model.
   */
  readonly source: 'derivative' | 'source'
  /** Bytes `model` sends, for the `tap` button. */
  readonly modelBytes?: number | null | undefined
  /** `Entitlements.maxConvertBytes` of the file's workspace. */
  readonly maxConvertBytes: number
  /** The caller may store a thumbnail and the file has none: the Worker renders one while parsing. */
  readonly onThumbnail?: ((blob: Blob) => void) | undefined
  /**
   * The caller may store the GLB derivative (edit + download, desktop, docs/11 §2.5 lazy path): the Worker writes it
   * while parsing the source and this receives it once the model is on screen.
   */
  readonly onDerivative?: ((glb: ArrayBuffer, stats: Stats) => void) | undefined
  /** With `onDerivative`: the conversion failed for a reason that is the file's (not the network, not a cancel). */
  readonly onConvertFailed?: ((code: ErrorCode) => void) | undefined
  /** Offer "Try again" on every error (an edit user's retry of a failed derivative). */
  readonly retryAlways?: boolean | undefined
  /**
   * Edit + download on a desktop, with `onDerivative`: a GLB derivative that does not load can be rebuilt from the
   * source at this URL (`content`), converted again and stored again.
   */
  readonly rebuildUrl?: string | undefined
  /** `edit` permission: a broken file offers "Upload new version". */
  readonly onUploadVersion?: (() => void) | undefined
  /** The page's download button, repeated next to error texts when the caller may download. */
  readonly downloadAction?: ReactNode
  readonly studio?: ViewerStudio | undefined
  /** Classes of the canvas box; the default is the file page's fixed height. */
  readonly frameClassName?: string | undefined
  /** Floats over the ready canvas (selection bar, path bar). */
  readonly overlay?: ReactNode
  /** First items of the toolbar (the phone's "Parts" button). */
  readonly toolbarStart?: ReactNode
  /** The page's toolbar in place of the default one (the studio's, Faz 5d). */
  readonly toolbar?: ((controls: ViewerControls) => ReactNode) | undefined
  /** Hides the canvas (folder view) without unmounting the open model. */
  readonly hidden?: boolean | undefined
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
      // The percent is for the eye; the live region says only "Downloading" (no announcement per percent).
      return <>{ratio === null ? t('viewer.stage.downloadUnknown') : t('viewer.stage.download', { percent: Math.round(ratio * 100) })}</>
    case 'convert':
      return <>{t('viewer.stage.convert', { format })}</>
    case 'parse':
      return <>{t('viewer.stage.parse')}</>
    case 'thumbnail':
      return <>{t('viewer.stage.thumbnail')}</>
    case 'derive':
      return <>{t('viewer.stage.derive')}</>
    case 'build':
      return <>{t('viewer.stage.build')}</>
  }
}

/**
 * What screen readers hear: the stage, the idle reason or the error, never the percent. Kept mounted so a change is
 * announced; the visible panel is not a live region.
 */
const announcement = (state: ViewerState, format: string, t: ReturnType<typeof useI18n>['t'], errorText: (code: ViewerError) => string): string => {
  const phase = state.phase
  switch (phase.status) {
    case 'ready':
      return ''
    case 'idle':
      return phase.reason === 'phone' ? t('viewer.phone') : phase.reason === 'tap' ? t('viewer.tapLead') : t('viewer.canceled')
    case 'error':
      return errorText(phase.code)
    case 'loading':
      switch (phase.stage) {
        case 'download':
          return t('viewer.stage.downloadUnknown')
        case 'convert':
          return t('viewer.stage.convert', { format })
        case 'parse':
          return t('viewer.stage.parse')
        case 'thumbnail':
          return t('viewer.stage.thumbnail')
        case 'derive':
          return t('viewer.stage.derive')
        case 'build':
          return t('viewer.stage.build')
      }
  }
}

/** The panel over the thumbnail while the canvas is not ready. Texts sit on the canvas colour (13.5:1, docs/03 §5). */
const StatusPanel = ({ state, format, onCancel, onStart, onRebuild, onUploadVersion, downloadAction, errorText, retryAlways, tapLabel }: {
  state: ViewerState
  format: string
  onCancel: () => void
  onStart: () => void
  /** The stored GLB did not load and the caller may convert the source again. */
  onRebuild?: (() => void) | undefined
  onUploadVersion?: (() => void) | undefined
  downloadAction?: ReactNode
  errorText: (code: ViewerError) => string
  retryAlways: boolean
  tapLabel: string
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
      phase.reason === 'tap' ? (
        <>
          <p className="text-base opacity-85">{t('viewer.tapLead')}</p>
          {actions(
            <Button variant="primary" onClick={onStart}>
              {tapLabel}
            </Button>,
          )}
        </>
      ) : phase.reason === 'phone' ? (
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
        <p className="text-md">{errorText(phase.code)}</p>
        {actions(
          <>
            {can.retry || (retryAlways && phase.code !== 'webgl') ? (
              <Button variant="secondary" onClick={onStart}>
                {t('viewer.retry')}
              </Button>
            ) : null}
            {onRebuild ? (
              <Button variant="secondary" onClick={onRebuild}>
                {t('viewer.rebuild')}
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
    <div className="absolute inset-x-3 bottom-3 mx-auto grid max-w-120 gap-2 rounded-lg bg-canvas/92 p-3 text-canvas-text app:bottom-5 app:p-4">
      {body}
    </div>
  )
}

const Viewer = ({
  name, extension, size, url, thumbnailUrl, start, source: sourceProp, modelBytes, maxConvertBytes, onThumbnail, onDerivative, onConvertFailed, retryAlways,
  rebuildUrl, onUploadVersion, downloadAction, studio, frameClassName, overlay, toolbarStart, toolbar, hidden,
}: ViewerProps) => {
  const { t, locale } = useI18n()
  const [state, dispatch] = useReducer(viewerReducer, start, initialViewerState)
  // Frozen per mount (see `source`): the camera, wireframe and edges of the open model stay as they are.
  const [source] = useState(sourceProp)
  // The stored GLB failed to load (not the network): an editor may convert the source again (`rebuildUrl`).
  const [glbBroken, setGlbBroken] = useState(false)
  const fromSource = useRef(false)
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<SceneHandle | null>(null)
  const tools = useRef<{ scene: SceneHandle; loading: Promise<ToolsApi | null>; live: ToolsApi | null } | null>(null)
  const cancelJob = useRef<(() => void) | null>(null)
  const thumbnailSink = useRef(onThumbnail)
  thumbnailSink.current = onThumbnail
  const derivativeSink = useRef(onDerivative)
  derivativeSink.current = onDerivative
  const failureSink = useRef(onConvertFailed)
  failureSink.current = onConvertFailed
  // A reload that finds the GLB stored turns `rebuildUrl` on (kind 'derivative'): read through a ref, so the open model
  // does not download again.
  const rebuildRef = useRef(rebuildUrl)
  rebuildRef.current = rebuildUrl
  // A rename changes the name, not the model: the load reads it from a ref and does not restart.
  const nameRef = useRef(name)
  nameRef.current = name
  const studioRef = useRef(studio)
  studioRef.current = studio
  const format = formatOfExtension(extension)
  const label = fileTypeOfExtension(extension)?.label ?? extension.toUpperCase()
  const ready = state.phase.status === 'ready'
  const canvasLabel = t('viewer.canvas', { name })
  const errorText = (code: ViewerError) => (code === 'too_large' ? t('viewer.error.tooLarge', { size: megabytes(maxConvertBytes) }) : t(errorTextKey(code)))

  // The scene: one renderer per mounted viewer, disposed on unmount (docs/11 §6).
  useEffect(() => {
    if (!host.current) return
    try {
      scene.current = createScene(host.current, canvasLabel, { onPick: (path) => studioRef.current?.onPick(path) })
    } catch (error) {
      if (error instanceof WebGlUnavailable) dispatch({ type: 'fail', code: 'webgl' })
      else throw error
    }
    return () => {
      tools.current?.live?.dispose()
      tools.current = null
      scene.current?.dispose()
      scene.current = null
    }
    // The label is set once; a language switch while the viewer is open keeps the first text until the next open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One load per attempt: download → (GLB: GLTFLoader | source: Worker) → three objects. Leaving the page or Cancel stops both.
  useEffect(() => {
    if (state.attempt === 0 || scene.current === null) return
    if (format === null) return dispatch({ type: 'fail', code: 'unsupported' })
    // The source of a STEP/IGES/3MF: the Worker converts it, and writes the GLB when the page can store it. A rebuild
    // reads the source from `rebuildUrl` even though `model` would answer with the (broken) GLB.
    const rebuildFrom = rebuildRef.current
    const rebuilding = fromSource.current && rebuildFrom !== undefined
    const converting = (source === 'source' || rebuilding) && isConvertFormat(format)
    const deriving = converting && derivativeSink.current !== undefined
    const failed = (code: ErrorCode) => {
      dispatch({ type: 'fail', code })
      // A failure that is the file's (not the network) is recorded once, so the next open does not convert it again.
      if (deriving && code !== 'network') failureSink.current?.(code)
    }
    if (converting && size > maxConvertBytes) return failed('too_large')
    const controller = new AbortController()
    let stop: (() => void) | null = () => controller.abort()
    cancelJob.current = () => stop?.()
    void (async () => {
      // One render per whole percent, not per network chunk.
      let shown = -2
      const fetched = await download(rebuilding ? rebuildFrom : url, controller.signal, (ratio) => {
        const step = ratio === null ? -1 : Math.floor(ratio * 100)
        if (step === shown) return
        shown = step
        dispatch({ type: 'progress', stage: 'download', ratio })
      })
      if (controller.signal.aborted) return
      if (!fetched.ok) return dispatch({ type: 'fail', code: 'network' })
      if (fetched.contentType === GLB_CONTENT_TYPE && !rebuilding) {
        // The derivative: already triangles, read on this thread by a lazily loaded GLTFLoader (no Worker, no WASM).
        dispatch({ type: 'progress', stage: 'parse', ratio: null })
        // A chunk that did not arrive is the network (Retry), not the file.
        const module = await loadGlbModule().catch(() => null)
        if (controller.signal.aborted) return
        if (module === null) return dispatch({ type: 'fail', code: 'network' })
        try {
          const loaded = await module.loadGlb(fetched.bytes)
          if (controller.signal.aborted || scene.current === null) return
          scene.current.setModel(loaded.root, loaded.stats)
          dispatch({ type: 'ready', stats: loaded.stats })
        } catch (error) {
          if (controller.signal.aborted) return
          dispatch({ type: 'fail', code: error instanceof ParseFailure ? error.code : classifyError(error) })
          setGlbBroken(true)
        }
        return
      }
      const job = parseInWorker({
        format,
        name: nameRef.current,
        bytes: fetched.bytes,
        thumbnail: thumbnailSink.current !== undefined,
        derive: deriving,
        maxConvertBytes,
        onProgress: (stage, ratio) => dispatch({ type: 'progress', stage, ratio }),
      })
      stop = job.cancel
      const outcome = await job.result
      if (!outcome.ok) {
        if (outcome.code !== 'canceled') failed(outcome.code)
        return
      }
      dispatch({ type: 'progress', stage: 'build', ratio: null })
      const handle = scene.current
      if (handle === null) return
      try {
        handle.setModel(buildModel(outcome.model), outcome.stats)
      } catch (error) {
        // three.js on the main thread (geometry upload, a GPU allocation) can still fail after a good parse.
        return dispatch({ type: 'fail', code: classifyError(error) })
      }
      dispatch({ type: 'ready', stats: outcome.stats })
      if (outcome.thumbnail !== null) thumbnailSink.current?.(outcome.thumbnail)
      if (outcome.glb !== null) derivativeSink.current?.(outcome.glb, outcome.stats)
    })()
    return () => {
      stop?.()
      stop = null
      cancelJob.current = null
    }
  }, [state.attempt, url, format, size, source, maxConvertBytes])

  useEffect(() => {
    if (ready) scene.current?.setWireframe(state.wireframe)
  }, [ready, state.wireframe])

  // The studio: the outline once per open model, then the page's view (hide, isolate, selection, looks).
  const studioView = studio?.view
  const isolated = studioView?.isolated ?? null
  useEffect(() => {
    studioRef.current?.onReady?.(ready)
    if (!ready || studioRef.current === undefined) return
    studioRef.current.onOutline(scene.current?.outline() ?? null)
  }, [ready, state.attempt])
  useEffect(() => {
    if (ready && studioView !== undefined) scene.current?.setView(studioView)
  }, [ready, studioView])
  useEffect(() => {
    if (ready && studioRef.current !== undefined) scene.current?.focus(isolated)
  }, [ready, isolated])
  useEffect(() => {
    const api = studio?.api
    if (api === undefined) return
    api.current = {
      thumbnail: (path, width, height) => scene.current?.thumbnail(path, width, height) ?? Promise.resolve(null),
      sizeOf: (path) => scene.current?.sizeOf(path) ?? null,
      colorOf: (path) => scene.current?.colorOf(path) ?? null,
      triangles: async (path) => {
        const object = scene.current?.objectAt(path)
        if (!object) return 0
        return (await loadStlModule()).countTriangles(object)
      },
      exportStl: async (path, centered, partName) => {
        const object = scene.current?.objectAt(path)
        if (!object) return null
        const module = await loadStlModule().catch(() => null)
        if (module === null || scene.current?.objectAt(path) !== object) return null
        const pieces = module.writeStl(object, { centered, name: partName })
        return pieces === null ? null : new Blob(pieces, { type: 'model/stl' })
      },
      view: (name) => scene.current?.view(name),
      tools: () => {
        const handle = scene.current
        if (handle === null) return Promise.resolve(null)
        if (tools.current?.scene !== handle) {
          const entry: { scene: SceneHandle; loading: Promise<ToolsApi | null>; live: ToolsApi | null } = { scene: handle, live: null, loading: Promise.resolve(null) }
          entry.loading = loadTools().then(
            (module) => {
              // The viewer may have closed while the chunk loaded.
              if (tools.current !== entry) return null
              entry.live = module.createTools(handle.host())
              return entry.live
            },
            (error: unknown) => {
              // Not kept: the next tool opened tries the chunk again.
              if (tools.current === entry) tools.current = null
              throw error
            },
          )
          tools.current = entry
        }
        return tools.current.loading
      },
    }
    return () => {
      api.current = null
    }
  }, [studio?.api])
  useEffect(() => {
    if (ready) scene.current?.setEdges(state.edges)
  }, [ready, state.edges])

  const stats = state.phase.status === 'ready' ? state.phase.stats : null
  const notReady = ready ? {} : { disabledReason: t('viewer.tool.notReady') }
  const pressed = 'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent'
  const number = (n: number) => n.toLocaleString(locale)

  const controls: ViewerControls = {
    ready,
    stats,
    wireframe: state.wireframe,
    edges: state.edges,
    edgesAvailable: edgesAvailable(state),
    fit: () => scene.current?.fit(),
    view: (name) => scene.current?.view(name),
    toggleWireframe: () => dispatch({ type: 'toggleWireframe' }),
    toggleEdges: () => dispatch({ type: 'toggleEdges' }),
  }

  return (
    <section aria-label={t('viewer.region')} hidden={hidden} className={cx('min-w-0 gap-2', hidden ? 'hidden' : 'grid', frameClassName && 'h-full grid-rows-[minmax(0,1fr)_auto]')}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement(state, label, t, errorText)}
      </p>
      <div className={cx('relative overflow-hidden bg-canvas', frameClassName ?? 'h-[min(62dvh,600px)] min-h-72 rounded-lg')}>
        <div ref={host} className={cx('size-full', !ready && 'invisible')} />
        {ready ? overlay : (
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
              onRebuild={glbBroken && rebuildUrl !== undefined && state.phase.status === 'error' ? () => {
                fromSource.current = true
                setGlbBroken(false)
                dispatch({ type: 'start' })
              } : undefined}
              onUploadVersion={onUploadVersion}
              downloadAction={downloadAction}
              errorText={errorText}
              retryAlways={retryAlways === true}
              tapLabel={modelBytes ? t('viewer.tapOpenSize', { size: formatBytes(modelBytes, locale) }) : t('viewer.tapOpen')}
            />
          </>
        )}
      </div>

      {toolbar ? toolbar(controls) : <div role="toolbar" aria-label={t('viewer.toolbar')} className={cx('flex flex-wrap items-center gap-1', frameClassName && 'px-2 pb-1 app:px-3')}>
        {toolbarStart}
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
      </div>}
    </section>
  )
}

export default Viewer
