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

const Harness = ({ tools, wide, modelKey = 'f1:1' }: { tools: ToolsApi; wide: boolean; modelKey?: string }) => {
  const api = useRef<ViewerApi | null>({ tools: async () => tools } as unknown as ViewerApi)
  const state = useTools(api, modelKey, wide)
  return (
    <>
      <StudioToolbar
        controls={controls}
        wide={wide}
        tools={state}
        desktopOnly={wide ? undefined : [{ key: 'stl', label: 'Download as STL', icon: null, reason: 'Open on a computer to download parts as STL.' }]}
      />
      <ToolCard tools={state} wide={wide} fileName="Pump.step" nameOf={(path) => (path === '0.1' ? 'Motor' : 'Frame')} />
    </>
  )
}

const mount = (wide: boolean) => {
  const fake = fakeTools()
  const view = render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <Harness tools={fake.api} wide={wide} />
      </UiProvider>
    </I18nProvider>,
  )
  const rerender = (modelKey: string) =>
    view.rerender(
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Harness tools={fake.api} wide={wide} modelKey={modelKey} />
        </UiProvider>
      </I18nProvider>,
    )
  return { ...fake, user: userEvent.setup(), rerender }
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

  it('another model starts the tools over', async () => {
    const { api, user, rerender } = mount(true)
    await user.click(within(toolbar()).getByRole('button', { name: 'Section' }))
    rerender('f1:2')
    expect(screen.queryByRole('region', { name: 'Section' })).not.toBeInTheDocument()
    expect(within(toolbar()).getByRole('button', { name: 'Section' })).toHaveAttribute('aria-pressed', 'false')
    expect(api.section.set).toHaveBeenCalled()
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

  it('phone: touch mode, one measurement at a time', async () => {
    const { api, user, emit } = mount(false)
    await user.click(within(toolbar()).getByRole('button', { name: 'Measure' }))
    expect(api.measure.start).toHaveBeenLastCalledWith('touch', true)
    emit(one)
    const card = screen.getByRole('region', { name: 'Measure' })
    expect(within(card).getByText('104.8 mm')).toBeInTheDocument()
    expect(within(card).getByText('ΔZ -88.3')).toBeInTheDocument()
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
})
