// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../../components/ui/test-utils'
import { I18nProvider } from '#/i18n'
import type { SceneNode } from '#/shared/scene'
import type { OutlineNode } from '#/viewer/tree/outline'
import { NodeEditor } from './SceneEdit'

const node: OutlineNode = { path: '0.1', name: 'Motor', parts: 2, drawn: false, children: [] }

const editor = (entry: SceneNode | undefined, fileColor: string | null = '#b8c4d0') => {
  const onEdit = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <NodeEditor node={node} entry={entry} fileColor={fileColor} onEdit={onEdit} />
    </I18nProvider>,
  )
  return { onEdit, user: userEvent.setup() }
}

describe('NodeEditor', () => {
  it('saves nothing when a field is focused and left unchanged', async () => {
    const { onEdit, user } = editor(undefined)
    await user.click(screen.getByLabelText('Name'))
    await user.click(screen.getByLabelText('Colour code'))
    await user.tab()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('saves nothing for an untouched renamed node or a stored colour typed the same in upper case', async () => {
    const { onEdit, user } = editor({ name: 'Drive', color: '#2f5f99' })
    await user.click(screen.getByLabelText('Name'))
    const code = screen.getByLabelText('Colour code')
    await user.clear(code)
    await user.type(code, '2F5F99')
    await user.tab()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('saves a changed name and a changed colour code', async () => {
    const { onEdit, user } = editor(undefined)
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Drive{Enter}')
    expect(onEdit).toHaveBeenLastCalledWith({ name: 'Drive' })
    const code = screen.getByLabelText('Colour code')
    await user.clear(code)
    await user.type(code, '#112233')
    await user.tab()
    expect(onEdit).toHaveBeenLastCalledWith({ color: '#112233' })
  })
})
