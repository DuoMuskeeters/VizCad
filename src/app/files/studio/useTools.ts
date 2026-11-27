/**
 * The studio tools on the page (docs/11 §4.3–4.4, Faz 5d): which tool card is open, the section setting, the unit and
 * the measurements as the tools report them. The three.js side (`viewer/tools/tools.ts`) loads the first time a tool
 * opens. One card at a time; a section stays on while another card is open (so a screenshot can show it) until it is
 * turned off on its own card. Measurements stay drawn until cleared (B4: never saved; a screenshot may include them).
 */
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useI18n } from '#/i18n'
import type { ViewerApi } from '#/viewer/Viewer.client'
import { SCREENSHOT_DEFAULTS, type CoveredRect, type MeasureState, type ScreenshotOptions, type SectionSettings, type ToolsApi } from '#/viewer/tools/types'
import { formatLength, formatPlace, type LengthUnit } from './units'

export type ToolName = 'section' | 'measure' | 'shot'

const NO_MEASURES: MeasureState = { list: [], pending: null }

export type StudioTools = ReturnType<typeof useTools>

/** The section as the page keeps it; the canvas handle follows the screen and the open card, not the setting. */
export type SectionState = Omit<SectionSettings, 'handle'>

/**
 * `scope`: the isolated part's path (the section's range fits it), null for the whole model.
 */
export const useTools = (api: RefObject<ViewerApi | null>, modelKey: string | null, wide: boolean, scope: string | null = null) => {
  const { t, locale } = useI18n()
  const [tool, setTool] = useState<ToolName | null>(null)
  const [section, setSection] = useState<SectionState | null>(null)
  const [covered, setCovered] = useState<CoveredRect | null>(null)
  // The tools chunk did not load (offline, a new deploy): the card says so and offers to try again.
  const [failed, setFailed] = useState(false)
  // Bumped once the tools took a new scope, so the card reads the new range.
  const [, setScoped] = useState(0)
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

  const load = useCallback((): Promise<ToolsApi | null> => {
    const wanted = modelKey
    const loading = api.current?.tools()
    if (loading === undefined) return Promise.resolve(null)
    setFailed(false)
    return loading.then(
      (loaded) => {
        if (loaded !== null) setLive((current) => (current?.tools === loaded && current.key === wanted ? current : { key: wanted, tools: loaded }))
        return loaded
      },
      () => {
        setFailed(true)
        return null
      },
    )
  }, [api, modelKey])

  const open = useCallback(
    (name: ToolName | null) => {
      setTool((current) => (current === name ? null : name))
      if (name === null) return
      if (name === 'section') setSection((current) => current ?? { axis: 'x', position: 0.5, flipped: false, hatch: true })
      void load()
    },
    [load],
  )

  useEffect(() => {
    if (tools === null) return
    tools.section.setScope(scope)
    setScoped((n) => n + 1)
  }, [tools, scope])
  // The handle only on a desktop, and only while the section's card is open (closed, nothing says it is there).
  const handle = wide && tool === 'section'
  useEffect(() => {
    tools?.section.set(section === null ? null : { ...section, handle })
  }, [tools, section, handle])
  useEffect(() => {
    tools?.section.setCovered(covered)
  }, [tools, covered])
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
    failed,
    retry: () => void load(),
    setCovered,
    range: (axis: SectionSettings['axis']) => tools?.section.range(axis) ?? null,
    removeMeasure: (id: number) => tools?.measure.remove(id),
    clearMeasures: () => tools?.measure.clear(),
    // A tap before the chunk is in waits for it rather than failing.
    screenshot: (options: ScreenshotOptions): Promise<Blob | null> => (tools !== null ? Promise.resolve(tools) : load()).then((ready) => ready?.screenshot(options) ?? null),
  }
}
