// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import type { CommentView } from '#/shared/fileViews'
import { CommentsTab, type CommentPins, type Comments } from './FileTabs'
import type { FileAbilities } from './types'

const comment = (id: string, patch: Partial<CommentView> = {}): CommentView => ({
  id, parentId: null, author: { displayName: 'Mehmet Kaya' }, content: `text ${id}`, deleted: false, createdAt: 1_700_000_000, versionNumber: 4, anchor: null, mine: false, canDelete: false, ...patch,
})

const items = [
  comment('c1', { anchor: { path: '0.2.0', point: [1, 2, 3] } }),
  comment('c2', { anchor: { path: '0.1.1', point: [0, 0, 0] } }),
  comment('c3', { anchor: { path: '0.1.0', point: [0, 0, 0] }, versionNumber: 3 }),
  comment('c4'),
]

const can: FileAbilities = { edit: false, comment: true, download: false, viewHistory: false, trash: false, share: false }

const mount = (pins: Partial<CommentPins> = {}) => {
  const add = vi.fn(async (input: unknown) => ({ ok: true as const, data: comment('new', { anchor: (input as { anchor?: CommentView['anchor'] }).anchor ?? null }) }))
  const comments = { items, cursor: null, failed: false, load: vi.fn(), add, remove: vi.fn() } as unknown as Comments
  const props: CommentPins = {
    version: 4,
    numberOf: (c) => ({ c1: 1, c2: 2 } as Record<string, number>)[c.id] ?? null,
    where: (path) => ({ '0.2.0': 'Pump unit › Volute', '0.1.1': 'Motor › Fan' } as Record<string, string>)[path] ?? null,
    hidden: (path) => path === '0.1.1',
    onShow: vi.fn(),
    active: null,
    onActivate: vi.fn(),
    pending: null,
    pendingNumber: 3,
    placing: false,
    onPlace: vi.fn(),
    onClear: vi.fn(),
    show: true,
    onShowChange: vi.fn(),
    ...pins,
  }
  render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <CommentsTab comments={comments} can={can} pins={props} />
      </UiProvider>
    </I18nProvider>,
  )
  return { props, add, user: userEvent.setup() }
}

describe('comment pins in the Comments tab (B3)', () => {
  it('numbers pins of this version, fades a hidden part with Show, keeps an older version’s pin in the list only', async () => {
    const { props, user } = mount()
    const list = screen.getByRole('list', { name: 'Comments' })
    const first = within(list).getByRole('button', { name: /Pin 1/ })
    expect(first).toHaveTextContent('Pump unit › Volute')
    await user.click(first)
    expect(props.onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(within(list).getByText('· hidden')).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Show' }))
    expect(props.onShow).toHaveBeenCalledWith('0.1.1')
    expect(within(list).getByText('Pin left on version 3; not shown on this version')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Show pins on the model' }))
    expect(props.onShowChange).toHaveBeenCalledWith(false)
  })

  it('writes a comment on the placed pin; a reply carries no pin', async () => {
    const { props, add, user } = mount({ pending: { path: '0.2.0', point: [5, 6, 7], version: 4 } })
    expect(screen.getAllByText('Pump unit › Volute', { selector: 'span' })).toHaveLength(2)
    await user.type(screen.getByRole('textbox', { name: 'Write a comment' }), 'Torque value?')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(add).toHaveBeenCalledWith({ content: 'Torque value?', anchor: { path: '0.2.0', point: [5, 6, 7], version: 4 } })
    expect(props.onClear).toHaveBeenCalled()
  })

  it('a pin placed on a version that is no longer current: the pin and the text stay, and it says why', async () => {
    const { props, add, user } = mount({ pending: { path: '0.2.0', point: [5, 6, 7], version: 3 } })
    add.mockResolvedValueOnce({ ok: false, status: 409, error: 'VersionChanged' } as never)
    const field = screen.getByRole('textbox', { name: 'Write a comment' })
    await user.type(field, 'Torque value?')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ anchor: expect.objectContaining({ version: 3 }) }))
    expect(await screen.findByText(/A new version of this file arrived after you placed the pin on version 3/)).toBeInTheDocument()
    expect(props.onClear).not.toHaveBeenCalled()
    expect(field).toHaveValue('Torque value?')
  })

  it('the pin button starts placing; Remove the pin clears it', async () => {
    const { props, user } = mount({ pending: { path: '0.2.0', point: [0, 0, 0], version: 4 } })
    await user.click(screen.getByRole('button', { name: 'Move pin' }))
    expect(props.onPlace).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove the pin' }))
    expect(props.onClear).toHaveBeenCalled()
  })
})
