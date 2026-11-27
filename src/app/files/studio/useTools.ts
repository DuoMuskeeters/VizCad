/**
 * The studio tools on the page (docs/11 §4.3–4.4, Faz 5d): which tool card is open, the section setting, the unit and
 * the measurements as the tools report them. The three.js side (`viewer/tools/tools.ts`) loads the first time a tool
 * opens. One card at a time; a section stays on while another card is open (so a screenshot can show it) until it is
 * turned off on its own card. Measurements stay drawn until cleared (B4: never saved; a screenshot may include them).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useI18n } from '#/i18n'
import type { ViewerApi } from '#/viewer/Viewer.client'
import { SCREENSHOT_DEFAULTS, type MeasureState, type ScreenshotOptions, type SectionSettings, type ToolsApi, type Vec3 } from '#/viewer/tools/types'
import { formatLength, formatPlace, type LengthUnit } from './units'

/** `pin`: the next click on the model places a comment pin (no card; the Comments tab writes the comment). */
export type ToolName = 'section' | 'measure' | 'shot' | 'pin'

const NO_MEASURES: MeasureState = { list: [], pending: null }

export type StudioTools = ReturnType<typeof useTools>

export const useTools = (
  api: RefObject<ViewerApi | null>,
  modelKey: string | null,
  wide: boolean,
  /** A pin was placed on the model (tool `pin`). */
  onPin?: (pin: { readonly path: string; readonly point: Vec3 }) => void,
) => {
  const pinSink = useRef(onPin)
  pinSink.current = onPin
  const { t, locale } = useI18n()
  const [tool, setTool] = useState<ToolName | null>(null)
  const [section, setSection] = useState<SectionSettings | null>(null)
  const [unit, setUnit] = useState<LengthUnit>('mm')
  const [measure, setMeasure] = useState<MeasureState>(NO_MEASURES)
  const [shot, setShot] = useState<ScreenshotOptions>(SCREENSHOT_DEFAULTS)
  const [live, setLive] = useState<{ key: string | null; tools: ToolsApi } | null>(null)
  // Another model (a new version, another file): the tools start over; the viewer made new ones for its new scene.
  const [key, setKey] = useState(modelKey)
  if (key !== modelKey) {
    setKey(modelKey)
    setTool(null)
    setSection(null)
    setMeasure(NO_MEASURES)
  }
  const tools = live !== null && live.key === modelKey ? live.tools : null

  const load = useCallback(() => {
    const wanted = modelKey
    void api.current?.tools().then((loaded) => {
      if (loaded !== null) setLive((current) => (current?.tools === loaded && current.key === wanted ? current : { key: wanted, tools: loaded }))
    })
  }, [api, modelKey])

  const open = useCallback(
    (name: ToolName | null) => {
      setTool((current) => (current === name ? null : name))
      if (name === null) return
      if (name === 'section') setSection((current) => current ?? { axis: 'x', position: 0.5, flipped: false, hatch: true, handle: wide })
      load()
    },
    [load, wide],
  )

  useEffect(() => {
    tools?.section.set(section === null ? null : { ...section, handle: wide && section.handle })
  }, [tools, section, wide])
  const pinning = tool === 'pin'
  useEffect(() => {
    if (tools === null) return
    if (!pinning) return tools.pins.stop()
    tools.pins.start((pin) => {
      pinSink.current?.(pin)
      setTool(null)
    })
  }, [tools, pinning])
  const measuring = tool === 'measure'
  useEffect(() => {
    if (tools === null) return
    if (measuring) tools.measure.start(wide ? 'mouse' : 'touch', !wide)
    else tools.measure.stop()
  }, [tools, measuring, wide])
  useEffect(() => {
    if (tools === null) return
    const offMeasure = tools.measure.subscribe(setMeasure)
    const offDrag = tools.section.onDrag((position) => setSection((current) => (current === null ? null : { ...current, position })))
    return () => {
      offMeasure()
      offDrag()
    }
  }, [tools])
  useEffect(() => {
    tools?.setLabels({
      vertex: t('tools.measure.vertex'),
      edge: t('tools.measure.edge'),
      length: (mm) => formatLength(mm, unit, locale),
      plane: (axis, mm) => t('tools.section.tag', { axis: axis.toUpperCase(), value: formatPlace(mm, unit, locale) }),
    })
  }, [tools, unit, locale, t])

  // Escape closes the open card (the section stays on; its own card turns it off).
  useEffect(() => {
    if (tool === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTool(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool])

  return {
    tool,
    open,
    section,
    setSection,
    unit,
    setUnit,
    measure,
    shot,
    setShot,
    tools,
    /** Loads the tools chunk without opening a card (pins are drawn as soon as there are any). */
    ensure: load,
    range: (axis: SectionSettings['axis']) => tools?.section.range(axis) ?? null,
    removeMeasure: (id: number) => tools?.measure.remove(id),
    clearMeasures: () => tools?.measure.clear(),
    screenshot: (options: ScreenshotOptions) => tools?.screenshot(options) ?? Promise.resolve(null),
  }
}
