/**
 * The studio toolbar and tool cards (wireframe 12, docs/11 §4.3–4.4, B5, B8). Desktop: one row under the canvas, cards
 * float at the canvas's top left in the canvas family (dark in both themes). Phone: one row of labelled buttons
 * (Parts · Section · Measure · Screenshot · More), cards open as a sheet at the bottom in the app's theme. Plain React,
 * no three.js: the viewer chunk stays as it is.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  Axis3d, Camera, Check, Cuboid, Download, Ellipsis, Eraser, FileDown, FlipHorizontal2, Focus, Grid3x3, ListTree, Move, Paintbrush, Pointer, Rotate3d, Ruler,
  ScissorsLineDashed, Share, Trash2, X, ZoomIn,
} from 'lucide-react'
import { Button, IconButton } from '#/components/ui/Button'
import { cx, fastTransition } from '#/components/ui/cx'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '#/components/ui/Menu'
import { useToast } from '#/components/ui/Toast'
import { useI18n, type I18nKey } from '#/i18n'
import type { ViewName } from '#/viewer/scene/fit'
import type { Axis, Measurement, ScreenshotOptions, Snap } from '#/viewer/tools/types'
import type { ViewerControls } from '#/viewer/Viewer.client'
import { formatLength, formatPlace } from './units'
import type { StudioTools, ToolName } from './useTools'

const VIEWS: readonly ViewName[] = ['iso', 'front', 'top', 'right']
const viewKey: Record<ViewName, I18nKey> = { iso: 'viewer.view.iso', front: 'viewer.view.front', top: 'viewer.view.top', right: 'viewer.view.right' }
const toolKey: Record<ToolName, I18nKey> = { section: 'tools.section', measure: 'tools.measure', shot: 'tools.shot' }
const toolIcon: Record<ToolName, ReactNode> = {
  section: <ScissorsLineDashed aria-hidden className="size-4.5" />,
  measure: <Ruler aria-hidden className="size-4.5" />,
  shot: <Camera aria-hidden className="size-4.5" />,
}
const pressed = 'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent'

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

/** Phone (B8): the share sheet with the image when the browser can share files, else a download. */
const shareOrSave = async (blob: Blob, fileName: string) => {
  const file = new File([blob], fileName, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    // A dismissed share sheet is not an error.
    await nav.share({ files: [file], title: fileName }).catch(() => undefined)
    return
  }
  saveBlob(blob, fileName)
}

export type ToolbarProps = {
  readonly controls: ViewerControls
  readonly wide: boolean
  readonly tools: StudioTools
  /** The phone's Parts button (an assembly only). */
  readonly parts?: { readonly open: boolean; readonly onToggle: () => void; readonly disabledReason?: string | undefined } | undefined
  /** Desktop-only work, shown disabled in the phone's More menu with the reason (§4.4). */
  readonly desktopOnly?: ReadonlyArray<{ readonly key: string; readonly label: string; readonly icon: ReactNode; readonly reason: string }> | undefined
}

/** The studio toolbar. A tool's button is pressed while its card is open, or (section) while the cut is on. */
export const StudioToolbar = ({ controls, wide, tools, parts, desktopOnly }: ToolbarProps) => {
  const { t, locale } = useI18n()
  const notReady = controls.ready ? {} : { disabledReason: t('viewer.tool.notReady') }
  const isOn = (name: ToolName) => tools.tool === name || (name === 'section' && tools.section !== null)
  const number = (n: number) => n.toLocaleString(locale)

  if (wide)
    return (
      <div role="toolbar" aria-label={t('tools.toolbar')} className="flex flex-wrap items-center gap-1 px-2 pb-1 app:px-3">
        <Menu>
          <MenuTrigger asChild>
            <IconButton label={t('tools.views')} {...notReady}>
              <Axis3d aria-hidden className="size-4.5" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="start" className="min-w-44">
            {VIEWS.map((view) => (
              <MenuItem key={view} onSelect={() => controls.view(view)}>
                {t(viewKey[view])}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <IconButton label={t('tools.fit')} onClick={controls.fit} {...notReady}>
          <Focus aria-hidden className="size-4.5" />
        </IconButton>
        <IconButton label={t('tools.wireframe')} aria-pressed={controls.wireframe} className={pressed} onClick={controls.toggleWireframe} {...notReady}>
          <Grid3x3 aria-hidden className="size-4.5" />
        </IconButton>
        <IconButton
          label={t('tools.edges')}
          aria-pressed={controls.edges}
          className={pressed}
          onClick={controls.toggleEdges}
          {...(controls.ready && !controls.edgesAvailable ? { disabledReason: t('viewer.tool.edgesTooLarge') } : notReady)}
        >
          <Cuboid aria-hidden className="size-4.5" />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        {(['section', 'measure', 'shot'] as const).map((name) => (
          <Button key={name} variant="ghost" aria-pressed={isOn(name)} className={cx('px-2.5', pressed)} onClick={() => tools.open(name)} {...notReady}>
            {toolIcon[name]}
            {t(toolKey[name])}
          </Button>
        ))}
        {controls.stats ? (
          <p className="ml-auto text-sm text-text-3">
            {controls.stats.parts === 1
              ? t('viewer.statsOne', { triangles: number(controls.stats.triangles) })
              : t('viewer.stats', { triangles: number(controls.stats.triangles), parts: number(controls.stats.parts) })}
          </p>
        ) : null}
      </div>
    )

  // Phone (B5): one row, a label under each icon, 56 px tall.
  const cell = cx(
    'inline-flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md border border-transparent px-1 text-xs font-medium text-text-2',
    'aria-pressed:bg-accent-soft aria-pressed:text-accent aria-disabled:opacity-55',
    fastTransition,
  )
  const blocked = (reason: string | undefined, act: () => void) => () => {
    if (reason === undefined) act()
  }
  const reasonOf = (reason?: string) => (reason === undefined ? {} : { 'aria-disabled': true, title: reason })
  const notReadyReason = controls.ready ? undefined : t('viewer.tool.notReady')
  return (
    <div role="toolbar" aria-label={t('tools.toolbar')} className="flex items-stretch gap-0.5 pb-1">
      {parts ? (
        <button type="button" className={cell} aria-pressed={parts.open} onClick={blocked(parts.disabledReason, parts.onToggle)} {...reasonOf(parts.disabledReason)}>
          <ListTree aria-hidden className="size-5" />
          <span className="max-w-full truncate">{t('studio.view.parts')}</span>
        </button>
      ) : null}
      {(['section', 'measure', 'shot'] as const).map((name) => (
        <button key={name} type="button" className={cell} aria-pressed={isOn(name)} onClick={blocked(notReadyReason, () => tools.open(name))} {...reasonOf(notReadyReason)}>
          <span aria-hidden className="[&>svg]:size-5">{toolIcon[name]}</span>
          <span className="max-w-full truncate">{name === 'shot' ? t('tools.shot.short') : t(toolKey[name])}</span>
        </button>
      ))}
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className={cell} aria-label={t('tools.moreLabel')}>
            <Ellipsis aria-hidden className="size-5" />
            <span aria-hidden>{t('tools.more')}</span>
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-60">
          <MenuItem icon={<Focus />} onSelect={controls.fit} {...(notReadyReason ? { disabledReason: notReadyReason } : {})}>
            {t('tools.fit')}
          </MenuItem>
          <MenuLabel>{t('tools.views')}</MenuLabel>
          {VIEWS.map((view) => (
            <MenuItem key={view} icon={<Axis3d />} onSelect={() => controls.view(view)} {...(notReadyReason ? { disabledReason: notReadyReason } : {})}>
              {t(viewKey[view])}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={controls.wireframe ? <Check /> : <Grid3x3 />}
            onSelect={controls.toggleWireframe}
            aria-checked={controls.wireframe}
            role="menuitemcheckbox"
            {...(notReadyReason ? { disabledReason: notReadyReason } : {})}
          >
            {t('tools.wireframe')}
          </MenuItem>
          {desktopOnly && desktopOnly.length > 0 ? (
            <>
              <MenuSeparator />
              {desktopOnly.map((item) => (
                <MenuItem key={item.key} icon={item.icon} disabledReason={item.reason}>
                  {item.label}
                </MenuItem>
              ))}
            </>
          ) : null}
        </MenuContent>
      </Menu>
    </div>
  )
}

/** The icons the page uses for the desktop-only items of the phone's More menu. */
export const desktopOnlyIcons = { edit: <Paintbrush />, stl: <FileDown /> }

/** A two-to-three way choice in the card's tone: the canvas family on a desktop, the app theme on a phone. */
const Choice = <T extends string>({ label, value, options, onChange, dark }: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  dark: boolean
}) => (
  <div className="grid gap-1.5">
    <span className={cx('text-sm', dark ? 'opacity-75' : 'text-text-2')}>{label}</span>
    <div role="group" aria-label={label} className={cx('grid grid-flow-col auto-cols-fr gap-0.5 rounded-lg p-0.75', dark ? 'bg-white/8' : 'bg-hover')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'inline-flex h-11 items-center justify-center rounded-md border border-transparent px-3 text-base font-medium app:h-8.5 pointer-coarse:h-11',
            dark ? 'text-canvas-text/80 hover:text-canvas-text aria-pressed:border-white/15 aria-pressed:bg-white/15 aria-pressed:text-canvas-text' : 'text-text-2 hover:text-text aria-pressed:border-line aria-pressed:bg-bg aria-pressed:text-text',
            fastTransition,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
)

/** A labelled on/off row (`role="switch"`), the whole row is the target. */
const Toggle = ({ label, lead, on, onChange, dark }: { label: string; lead?: string; on: boolean; onChange: (on: boolean) => void; dark: boolean }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
    <span className="grid min-w-0 gap-0.5">
      <span className="text-base font-medium">{label}</span>
      {lead ? <span className={cx('text-sm', dark ? 'opacity-75' : 'text-text-3')}>{lead}</span> : null}
    </span>
    <span aria-hidden className={cx('relative h-6 w-10 shrink-0 rounded-full', on ? 'bg-accent' : dark ? 'bg-white/25' : 'bg-text-3', fastTransition)}>
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white', on ? 'left-4.5' : 'left-0.5', fastTransition)} />
    </span>
  </button>
)

const SectionBody = ({ tools, wide, dark }: { tools: StudioTools; wide: boolean; dark: boolean }) => {
  const { t, locale } = useI18n()
  const section = tools.section
  if (section === null) return null
  const range = tools.range(section.axis)
  const place = range === null ? null : range.min + section.position * (range.max - range.min)
  const set = (patch: Partial<typeof section>) => tools.setSection({ ...section, ...patch })
  return (
    <div className="grid gap-4">
      <Choice
        dark={dark}
        label={t('tools.section.axis')}
        value={section.axis}
        options={(['x', 'y', 'z'] as const).map((axis) => ({ value: axis, label: axis.toUpperCase() }))}
        onChange={(axis: Axis) => set({ axis, position: 0.5 })}
      />
      <label className="grid gap-1.5">
        <span className={cx('flex items-baseline justify-between text-sm', dark ? 'opacity-90' : 'text-text-2')}>
          {t('tools.section.place')}
          <b className="font-semibold tabular-nums">{place === null ? '' : formatPlace(place, tools.unit, locale)}</b>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(section.position * 1000)}
          onChange={(event) => set({ position: Number(event.target.value) / 1000 })}
          aria-valuetext={place === null ? undefined : formatPlace(place, tools.unit, locale)}
          className="h-11 w-full cursor-pointer accent-brand"
        />
      </label>
      <Toggle dark={dark} label={t('tools.section.hatch')} lead={t('tools.section.hatchLead')} on={section.hatch} onChange={(hatch) => set({ hatch })} />
      {wide ? <p className={cx('text-sm', dark ? 'opacity-75' : 'text-text-3')}>{t('tools.section.handle')}</p> : null}
    </div>
  )
}

const snapKey: Record<Snap, I18nKey> = { vertex: 'tools.measure.vertex', edge: 'tools.measure.edge', surface: 'tools.measure.surface' }

const MeasureBody = ({ tools, wide, dark, nameOf }: { tools: StudioTools; wide: boolean; dark: boolean; nameOf: (path: string | null) => string }) => {
  const { t, locale } = useI18n()
  const { list, pending } = tools.measure
  const length = (mm: number) => formatLength(mm, tools.unit, locale)
  const delta = (value: number) => (tools.unit === 'mm' ? (Math.round(value * 10) / 10).toLocaleString(locale) : (Math.round((value / 25.4) * 100) / 100).toLocaleString(locale))
  const endName = (m: Measurement, end: 'a' | 'b') => `${nameOf(m[end].path)} · ${t(snapKey[m[end].snap])}`
  return (
    <div className="grid gap-4">
      {list.length === 0 ? (
        <p className={cx('text-base', dark ? 'opacity-90' : 'text-text-2')}>
          <b className="font-semibold">{pending === null ? t('tools.measure.empty') : t('tools.measure.pending')}</b>{' '}
          {pending === null ? (wide ? t('tools.measure.emptyMouse') : t('tools.measure.emptyTouch')) : null}
        </p>
      ) : (
        <ol className="grid gap-1.5">
          {list.map((m, i) => (
            <li key={m.id} className={cx('grid gap-1 rounded-lg border p-2 pl-3', i === list.length - 1 ? 'border-accent' : dark ? 'border-white/12' : 'border-line')}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <b className="block text-md font-semibold tabular-nums">{length(m.distance)}</b>
                  <span className={cx('block truncate text-sm', dark ? 'opacity-75' : 'text-text-3')}>{t('tools.measure.between', { a: endName(m, 'a'), b: endName(m, 'b') })}</span>
                </div>
                <button
                  type="button"
                  aria-label={t('tools.measure.remove', { number: i + 1 })}
                  onClick={() => tools.removeMeasure(m.id)}
                  className={cx('grid size-11 shrink-0 place-items-center rounded-md app:size-8 pointer-coarse:size-11', dark ? 'hover:bg-white/10' : 'hover:bg-hover')}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
              <p className={cx('flex flex-wrap gap-x-3 text-sm tabular-nums', dark ? 'opacity-85' : 'text-text-2')}>
                <span>ΔX {delta(m.delta[0])}</span>
                <span>ΔY {delta(m.delta[1])}</span>
                <span>ΔZ {delta(m.delta[2])}</span>
              </p>
            </li>
          ))}
          {pending !== null ? <li className={cx('text-sm', dark ? 'opacity-80' : 'text-text-2')}>{t('tools.measure.pending')}</li> : null}
        </ol>
      )}
      <Choice
        dark={dark}
        label={t('tools.measure.unit')}
        value={tools.unit}
        options={[{ value: 'mm', label: 'mm' }, { value: 'in', label: t('tools.measure.inch') }]}
        onChange={tools.setUnit}
      />
      <p className={cx('text-sm', dark ? 'opacity-75' : 'text-text-3')}>{t('tools.measure.unitNote')}</p>
    </div>
  )
}

const ShotBody = ({ tools, dark }: { tools: StudioTools; dark: boolean }) => {
  const { t } = useI18n()
  const shot = tools.shot
  const set = (patch: Partial<ScreenshotOptions>) => tools.setShot({ ...shot, ...patch })
  return (
    <div className="grid gap-4">
      <Choice
        dark={dark}
        label={t('tools.shot.background')}
        value={shot.background}
        options={[
          { value: 'canvas', label: t('tools.shot.canvas') },
          { value: 'white', label: t('tools.shot.white') },
          { value: 'transparent', label: t('tools.shot.transparent') },
        ]}
        onChange={(background) => set({ background })}
      />
      <Choice
        dark={dark}
        label={t('tools.shot.size')}
        value={shot.scale === 2 ? 'double' : 'screen'}
        options={[{ value: 'screen', label: t('tools.shot.screen') }, { value: 'double', label: t('tools.shot.double') }]}
        onChange={(size) => set({ scale: size === 'double' ? 2 : 1 })}
      />
      {tools.measure.list.length > 0 ? <Toggle dark={dark} label={t('tools.shot.measures')} on={shot.measures} onChange={(measures) => set({ measures })} /> : null}
      <p className={cx('text-sm', dark ? 'opacity-75' : 'text-text-3')}>{t('tools.shot.note')}</p>
    </div>
  )
}

/**
 * The open tool's card. `wide`: floats on the canvas (rendered in the viewer's overlay); else a sheet at the bottom of
 * the screen over the page (rendered by the page).
 */
export const ToolCard = ({ tools, wide, fileName, nameOf, below }: {
  tools: StudioTools
  wide: boolean
  fileName: string
  nameOf: (path: string | null) => string
  /** Desktop: the selection bar takes the top of the canvas; the card sits under it. */
  below?: boolean
}) => {
  const { t } = useI18n()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const name = tools.tool
  if (name === null) return null
  const dark = wide
  const title = t(toolKey[name])
  const take = () => {
    setBusy(true)
    void tools
      .screenshot(tools.shot)
      .then(async (blob) => {
        if (blob === null) return toast({ title: t('tools.shot.failed'), tone: 'danger' })
        const png = `${fileName.replace(/\.[^.]+$/, '') || 'model'}.png`
        if (wide) saveBlob(blob, png)
        else await shareOrSave(blob, png)
      })
      .finally(() => setBusy(false))
  }
  const footer =
    name === 'section' ? (
      <>
        <Button onClick={() => tools.section !== null && tools.setSection({ ...tools.section, flipped: !tools.section.flipped })} className={dark ? 'border-white/20 bg-transparent text-canvas-text hover:bg-white/10' : undefined}>
          <FlipHorizontal2 aria-hidden className="size-4.5" />
          {t('tools.section.flip')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            tools.setSection(null)
            tools.open(null)
          }}
          className={dark ? 'text-canvas-text hover:bg-white/10' : undefined}
        >
          {t('tools.section.off')}
        </Button>
      </>
    ) : name === 'measure' ? (
      tools.measure.list.length > 0 || tools.measure.pending !== null ? (
        <Button onClick={tools.clearMeasures} className={dark ? 'border-white/20 bg-transparent text-canvas-text hover:bg-white/10' : undefined}>
          <Eraser aria-hidden className="size-4.5" />
          {t('tools.measure.clear')}
        </Button>
      ) : null
    ) : (
      <Button variant="primary" loading={busy} onClick={take}>
        {wide ? <Download aria-hidden className="size-4.5" /> : <Share aria-hidden className="size-4.5" />}
        {wide ? t('tools.shot.download') : t('tools.shot.share')}
      </Button>
    )
  return (
    <section
      aria-label={title}
      className={cx(
        wide
          ? cx('absolute left-3 z-10 grid max-h-[calc(100%-24px)] w-76 gap-3 overflow-y-auto rounded-xl border border-white/10 bg-canvas/95 p-4 text-canvas-text shadow-pop', below ? 'top-16' : 'top-3')
          : 'fixed inset-x-0 bottom-0 z-30 grid max-h-[58dvh] gap-3 overflow-y-auto rounded-t-xl border-t border-line bg-bg px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-pop',
      )}
    >
      <header className="flex items-center gap-2">
        <span aria-hidden className={cx('[&>svg]:size-4.5', dark ? 'text-brand' : 'text-accent')}>{toolIcon[name]}</span>
        <h2 className="text-md font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={t('tools.close', { tool: title })}
          onClick={() => tools.open(null)}
          className={cx('ml-auto grid size-11 place-items-center rounded-md app:size-8 pointer-coarse:size-11', dark ? 'hover:bg-white/10' : 'hover:bg-hover')}
        >
          <X aria-hidden className="size-4.5" />
        </button>
      </header>
      {name === 'section' ? <SectionBody tools={tools} wide={wide} dark={dark} /> : name === 'measure' ? <MeasureBody tools={tools} wide={wide} dark={dark} nameOf={nameOf} /> : <ShotBody tools={tools} dark={dark} />}
      {footer ? <footer className="flex flex-wrap gap-2">{footer}</footer> : null}
    </section>
  )
}

/** The hint pill while measuring (wireframe 12): what the next step is. Canvas family, at the bottom of the canvas. */
export const MeasureHint = ({ wide }: { wide: boolean }) => {
  const { t } = useI18n()
  return (
    <p className="pointer-events-none absolute inset-x-2 bottom-2 z-10 mx-auto flex w-fit max-w-[calc(100%-16px)] items-center gap-2 rounded-full border border-white/10 bg-canvas/92 px-3 py-1.5 text-sm text-canvas-text app:bottom-3">
      <Ruler aria-hidden className="size-4 shrink-0 text-brand" />
      {wide ? t('tools.measure.hintMouse') : t('tools.measure.hintTouch')}
    </p>
  )
}

const GESTURES_SEEN = 'vizcad.gestures.seen'

/** The phone's first open (wireframe 12 "dokunma"): the touch gestures once, then never again on this device. */
export const GestureHints = () => {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(GESTURES_SEEN) === null) setShow(true)
    } catch {
      // Storage blocked (private mode): no hints rather than hints every time.
    }
  }, [])
  if (!show) return null
  const done = () => {
    setShow(false)
    try {
      window.localStorage.setItem(GESTURES_SEEN, '1')
    } catch {
      // See above.
    }
  }
  const rows: ReadonlyArray<[ReactNode, I18nKey, I18nKey]> = [
    [<Rotate3d key="r" />, 'tools.gestures.rotate', 'tools.gestures.rotateLead'],
    [<ZoomIn key="z" />, 'tools.gestures.zoom', 'tools.gestures.zoomLead'],
    [<Move key="m" />, 'tools.gestures.pan', 'tools.gestures.panLead'],
    [<Pointer key="p" />, 'tools.gestures.tap', 'tools.gestures.tapLead'],
  ]
  return (
    <div role="dialog" aria-label={t('tools.gestures.title')} className="absolute inset-0 z-20 grid content-center justify-items-center gap-5 bg-canvas/90 p-6 text-canvas-text">
      <h2 className="text-lg font-semibold">{t('tools.gestures.title')}</h2>
      <ul className="grid w-full max-w-75 gap-3.5">
        {rows.map(([icon, title, lead]) => (
          <li key={title} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
            <span aria-hidden className="grid size-11 place-items-center rounded-full border-[1.5px] border-white/30 text-brand [&>svg]:size-5">{icon}</span>
            <span className="text-md">
              {t(title)}
              <small className="block text-sm opacity-75">{t(lead)}</small>
            </span>
          </li>
        ))}
      </ul>
      <Button variant="primary" className="min-w-40" onClick={done}>
        {t('tools.gestures.done')}
      </Button>
    </div>
  )
}
