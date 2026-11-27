// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import type { MeasureState, ToolsApi } from '#/viewer/tools/types'
import type { ViewerApi, ViewerControls } from '#/viewer/Viewer.client'
import { StudioToolbar, ToolCard } from './Tools'
import { formatLength } from './units'
import { useTools } from './useTools'

/** A ToolsApi that records what the page asks of it. */
const fakeTools = () => {
  let measureListener: ((state: MeasureState) => void) | null = null
  let dragListener: ((position: number) => void) | null = null
  const api = {
    section: {
      set: vi.fn(),
      range: vi.fn(() => ({ min: -100, max: 300 })),
      onDrag: vi.fn((listener: (position: number) => void) => {
        dragListener = listener
        return () => {}
      }),
      setScope: vi.fn(),
      setCovered: vi.fn(),
    },
    measure: {
      start: vi.fn(),
      stop: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      subscribe: vi.fn((listener: (state: MeasureState) => void) => {
        measureListener = listener
        return () => {}
      }),
    },
    pins: { set: vi.fn(), start: vi.fn(), stop: vi.fn(), onSelect: vi.fn(() => () => {}) },
    camera: { get: vi.fn(() => ({ position: [100, -100, 80] as const, target: [0, 0, 0] as const, up: [0, 0, 1] as const, fov: 35 })), set: vi.fn() },
    setLabels: vi.fn(),
    screenshot: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    dispose: vi.fn(),
  } satisfies ToolsApi
  return { api, emit: (state: MeasureState) => act(() => measureListener?.(state)), drag: (position: number) => act(() => dragListener?.(position)) }
}

const controls: ViewerControls = {
  ready: true, stats: null, wireframe: false, edges: false, edgesAvailable: true,
  fit: vi.fn(), view: vi.fn(), toggleWireframe: vi.fn(), toggleEdges: vi.fn(),
}

type HarnessProps = { tools: ToolsApi; wide: boolean; modelKey?: string; scope?: string | null; ready?: boolean; load?: () => Promise<ToolsApi | null> }
const Harness = ({ tools, wide, modelKey = 'f1:1', scope = null, ready = true, load }: HarnessProps) => {
  const api = useRef<ViewerApi | null>({ tools: load ?? (async () => tools) } as unknown as ViewerApi)
  const state = useTools(api, modelKey, wide, scope)
  return (
    <>
      <StudioToolbar
        controls={{ ...controls, ready }}
        wide={wide}
        tools={state}
        desktopOnly={wide ? undefined : [{ key: 'stl', label: 'Download as STL', icon: null, reason: 'Open on a computer to download parts as STL.' }]}
      />
      <ToolCard tools={state} wide={wide} fileName="Pump.step" nameOf={(path) => (path === '0.1' ? 'Motor' : 'Frame')} />
    </>
  )
}

const mount = (wide: boolean, props: Partial<Omit<HarnessProps, 'tools' | 'wide'>> = {}) => {
  const fake = fakeTools()
  const tree = (next: Partial<HarnessProps>) => (
    <I18nProvider initialLocale="en">
      <UiProvider>
        <Harness tools={fake.api} wide={wide} {...props} {...next} />
      </UiProvider>
    </I18nProvider>
  )
  const view = render(tree({}))
  const rerender = (modelKey: string) => view.rerender(tree({ modelKey }))
  return { ...fake, user: userEvent.setup(), rerender, update: (next: Partial<HarnessProps>) => view.rerender(tree(next)) }
}

const toolbar = () => screen.getByRole('toolbar', { name: 'Studio tools' })

afterEach(() => vi.unstubAllGlobals())

describe('section', () => {
  it('desktop: opens on X at the middle with the handle, follows the card, and turns off from its card', async () => {
    const { api, user, drag } = mount(true)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    expect(api.section.set).toHaveBeenLastCalledWith({ axis: 'x', position: 0.5, flipped: false, hatch: true, handle: true })
    const card = screen.getByRole('region', { name: 'Section' })
    expect(within(card).getByText('100 mm')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Y' }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ axis: 'y', position: 0.5 }))
    await user.click(within(card).getByRole('switch', { name: /Hatch the cut faces/ }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ hatch: false }))
    // The handle on the canvas moves the slider too.
    drag(0.75)
    expect(within(card).getByRole('slider')).toHaveValue('750')
    // Closing the card keeps the cut on (a screenshot may show it); the card's own button turns it off.
    await user.click(within(card).getByRole('button', { name: 'Close Section' }))
    expect(screen.queryByRole('region', { name: 'Section' })).not.toBeInTheDocument()
    expect(within(toolbar()).getByRole('button', { name: 'Section' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    await user.click(screen.getByRole('button', { name: 'Turn the section off' }))
    expect(api.section.set).toHaveBeenLastCalledWith(null)
    expect(within(toolbar()).getByRole('button', { name: 'Section' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('phone: the simple section, no handle and no hatch switch; flip in the axis row', async () => {
    const { api, user } = mount(false)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ handle: false }))
    const card = screen.getByRole('region', { name: 'Section' })
    expect(within(card).queryByRole('switch')).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Flip' }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ flipped: true }))
  })

  it('another model starts the tools over: no card, no cut, no measurement, the section back at its defaults', async () => {
    const { api, user, rerender, emit } = mount(true)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    await user.click(within(screen.getByRole('region', { name: 'Section' })).getByRole('button', { name: 'Y' }))
    emit({ list: [{ id: 1, a: { point: [0, 0, 0], path: '0.1', snap: 'vertex' }, b: { point: [1, 0, 0], path: '0.1', snap: 'vertex' }, distance: 1, delta: [1, 0, 0] }], pending: null })
    rerender('f1:2')
    expect(screen.queryByRole('region', { name: 'Section' })).not.toBeInTheDocument()
    expect(within(toolbar()).getByRole('button', { name: 'Section' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    expect(api.section.set).toHaveBeenLastCalledWith({ axis: 'x', position: 0.5, flipped: false, hatch: true, handle: true })
    await user.click(within(toolbar()).getByRole('button', { name: 'Measure' }))
    expect(within(screen.getByRole('region', { name: 'Measure' })).getByText('No measurement yet.')).toBeInTheDocument()
  })

  it('the canvas handle is there only on a desktop and only while the card is open; the card says what it covers', async () => {
    const { api, user, update } = mount(false)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ handle: false }))
    // The same section on a wider screen: the handle follows the screen, not the moment the section was made.
    update({ wide: true })
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ handle: true }))
    expect(api.section.setCovered).toHaveBeenLastCalledWith({ left: 0, top: 0, right: 0, bottom: 0 })
    await user.click(screen.getByRole('button', { name: 'Close Section' }))
    expect(api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ handle: false }))
    expect(api.section.setCovered).toHaveBeenLastCalledWith(null)
  })

  it('the desktop card never runs past a narrow canvas: its width is capped at the canvas less its margins', async () => {
    const { user } = mount(true)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    // jsdom has no layout: the cap is the class that sets it (w-72, at most the canvas width minus 12 px a side).
    expect(screen.getByRole('region', { name: 'Section' })).toHaveClass('w-72', 'max-w-[calc(100%-24px)]')
  })

  it('the range fits the isolated part', async () => {
    const { api, user, update } = mount(true, { scope: '0.1' })
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    expect(api.section.setScope).toHaveBeenLastCalledWith('0.1')
    update({ scope: null })
    expect(api.section.setScope).toHaveBeenLastCalledWith(null)
  })
})

describe('measure', () => {
  const one = {
    list: [{ id: 1, a: { point: [0, 0, 0], path: '0.1', snap: 'vertex' }, b: { point: [100, 0, 0], path: '0.0', snap: 'edge' }, distance: 104.8, delta: [15.8, 54.2, -88.3] }],
    pending: null,
  } as const satisfies MeasureState

  it('desktop: mouse mode with a list; mm or inch; delete and clear; closing stops placing', async () => {
    const { api, user, emit } = mount(true)
    await user.click(within(toolbar()).getByRole('button', { name: 'Measure' }))
    expect(api.measure.start).toHaveBeenLastCalledWith('mouse', false)
    const card = screen.getByRole('region', { name: 'Measure' })
    expect(within(card).getByText('No measurement yet.')).toBeInTheDocument()
    emit(one)
    expect(within(card).getByText('104.8 mm')).toBeInTheDocument()
    expect(within(card).getByText('Motor · Corner → Frame · Edge')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'in' }))
    expect(within(card).getByText(formatLength(104.8, 'in', 'en'))).toBeInTheDocument()
    // The canvas labels follow the unit.
    expect(api.setLabels.mock.lastCall![0].length(25.4)).toBe('1.00 in')
    await user.click(within(card).getByRole('button', { name: 'Delete measurement 1' }))
    expect(api.measure.remove).toHaveBeenCalledWith(1)
    await user.click(within(card).getByRole('button', { name: 'Clear all' }))
    expect(api.measure.clear).toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: 'Close Measure' }))
    expect(api.measure.stop).toHaveBeenCalled()
  })

  it('phone: touch mode, one measurement at a time, and what the unit means', async () => {
    const { api, user, emit } = mount(false)
    await user.click(within(toolbar()).getByRole('button', { name: 'Measure' }))
    expect(api.measure.start).toHaveBeenLastCalledWith('touch', true)
    emit(one)
    const card = screen.getByRole('region', { name: 'Measure' })
    expect(within(card).getByText('104.8 mm')).toBeInTheDocument()
    expect(within(card).getByText('ΔZ -88.3')).toBeInTheDocument()
    expect(within(card).getByText('Lengths are in the model’s units, read as millimetres.')).toBeInTheDocument()
  })
})

describe('screenshot (B8)', () => {
  it('desktop: 2×, canvas background, pins and measurements by default; downloads a PNG', async () => {
    const { api, user } = mount(true)
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: () => {} }))
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(within(toolbar()).getByRole('button', { name: 'Screenshot' }))
    await user.click(screen.getByRole('button', { name: 'Download PNG' }))
    expect(api.screenshot).toHaveBeenCalledWith({ background: 'canvas', scale: 2, pins: true, measures: true })
    expect(created).toHaveBeenCalled()
    expect(clicked).toHaveBeenCalled()
    clicked.mockRestore()
  })

  it('phone: shares the image when the browser can share files', async () => {
    const { api, user } = mount(false)
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share, canShare: () => true }))
    await user.click(within(toolbar()).getByRole('button', { name: 'Image' }))
    const card = screen.getByRole('region', { name: 'Screenshot' })
    await user.click(within(card).getByRole('button', { name: 'White' }))
    await user.click(within(card).getByRole('button', { name: 'Share or save' }))
    expect(api.screenshot).toHaveBeenCalledWith(expect.objectContaining({ background: 'white' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
  })

  it('phone: the image card offers the pins too', async () => {
    const fake = fakeTools()
    const Phone = () => {
      const api = useRef<ViewerApi | null>({ tools: async () => fake.api } as unknown as ViewerApi)
      const state = useTools(api, 'f1:1', false)
      return (
        <>
          <StudioToolbar controls={controls} wide={false} tools={state} />
          <ToolCard tools={state} wide={false} fileName="Pump.step" nameOf={() => ''} pins />
        </>
      )
    }
    const user = userEvent.setup()
    render(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Phone />
        </UiProvider>
      </I18nProvider>,
    )
    await user.click(within(toolbar()).getByRole('button', { name: 'Image' }))
    const card = screen.getByRole('region', { name: 'Screenshot' })
    await user.click(within(card).getByRole('switch', { name: 'Include comment pins' }))
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: vi.fn(async () => {}), canShare: () => true }))
    await user.click(within(card).getByRole('button', { name: 'Share or save' }))
    expect(fake.api.screenshot).toHaveBeenCalledWith(expect.objectContaining({ pins: false }))
  })

  const shareFails = async (error: Error) => {
    const { user } = mount(false)
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: vi.fn(async () => Promise.reject(error)), canShare: () => true }))
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: () => {} }))
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(within(toolbar()).getByRole('button', { name: 'Image' }))
    await user.click(screen.getByRole('button', { name: 'Share or save' }))
    const saved = clicked.mock.calls.length
    clicked.mockRestore()
    return saved
  }

  it('phone: a share that fails downloads the image instead', async () => {
    expect(await shareFails(Object.assign(new Error('no share target'), { name: 'NotAllowedError' }))).toBe(1)
  })

  it('phone: a dismissed share sheet downloads nothing', async () => {
    expect(await shareFails(Object.assign(new Error('dismissed'), { name: 'AbortError' }))).toBe(0)
  })

  it('a tap before the tools are in waits for them; a failed shot says so', async () => {
    const fake = fakeTools()
    let arrive: (tools: ToolsApi) => void = () => {}
    const load = vi.fn(() => new Promise<ToolsApi | null>((resolve) => (arrive = resolve)))
    const user = userEvent.setup()
    render(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Harness tools={fake.api} wide load={load} />
        </UiProvider>
      </I18nProvider>,
    )
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: () => {} }))
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(within(toolbar()).getByRole('button', { name: 'Screenshot' }))
    await user.click(screen.getByRole('button', { name: 'Download PNG' }))
    expect(fake.api.screenshot).not.toHaveBeenCalled()
    await act(async () => arrive(fake.api))
    expect(fake.api.screenshot).toHaveBeenCalled()
    expect(clicked).toHaveBeenCalledTimes(1)
    clicked.mockRestore()
    fake.api.screenshot.mockRejectedValueOnce(new Error('context lost'))
    await user.click(screen.getByRole('button', { name: 'Download PNG' }))
    expect(await screen.findByText('The screenshot could not be made.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PNG' })).not.toHaveAttribute('aria-busy')
  })
})

describe('the tools chunk', () => {
  it('did not load: the card says so and tries again', async () => {
    const fake = fakeTools()
    const load = vi.fn<() => Promise<ToolsApi | null>>().mockRejectedValueOnce(new Error('chunk')).mockResolvedValue(fake.api)
    const user = userEvent.setup()
    render(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Harness tools={fake.api} wide load={load} />
        </UiProvider>
      </I18nProvider>,
    )
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    const card = screen.getByRole('region', { name: 'Section' })
    expect(await within(card).findByRole('alert')).toHaveTextContent('The tools could not be loaded.')
    await user.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(load).toHaveBeenCalledTimes(2)
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument()
    expect(fake.api.section.set).toHaveBeenLastCalledWith(expect.objectContaining({ axis: 'x' }))
  })
})

describe('phone toolbar (B5)', () => {
  it('has Section, Measure, Image and More; More holds fit, views, wireframe and the desktop-only items with the reason', async () => {
    const { user } = mount(false)
    const bar = toolbar()
    for (const name of ['Section', 'Measure', 'Image', 'More tools']) expect(within(bar).getByRole('button', { name })).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'More tools' }))
    const menu = screen.getByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Fit' }))
    expect(controls.fit).toHaveBeenCalled()
    await user.click(within(bar).getByRole('button', { name: 'More tools' }))
    const stl = within(screen.getByRole('menu')).getByRole('menuitem', { name: /Download as STL/ })
    expect(stl).toHaveAttribute('aria-disabled', 'true')
    expect(stl).toHaveTextContent('Open on a computer to download parts as STL.')
  })

  it('a button tapped before the model is ready says why', async () => {
    const { api, user } = mount(false, { ready: false })
    const section = within(toolbar()).getByRole('button', { name: 'Section' })
    expect(section).toHaveAttribute('aria-disabled', 'true')
    await user.click(section)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Available once the model is open.')
    expect(api.section.set).not.toHaveBeenCalled()
  })
})
