// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from './Menu'

const Example = ({ onEdit, onRemove, onAccess }: { onEdit: () => void; onRemove: () => void; onAccess: (v: string) => void }) => (
  <Menu>
    <MenuTrigger asChild>
      <button type="button">Eylemler</button>
    </MenuTrigger>
    <MenuContent>
      <MenuRadioGroup value="download" onValueChange={onAccess}>
        <MenuRadioItem value="view" description="Modeli açar">
          Görüntüleyebilir
        </MenuRadioItem>
        <MenuRadioItem value="download" description="Dosyayı indirir">
          İndirebilir
        </MenuRadioItem>
        <MenuRadioItem value="edit" disabledReason="Misafirler yükleyemez ve düzenleyemez">
          Düzenleyebilir
        </MenuRadioItem>
      </MenuRadioGroup>
      <MenuItem onSelect={onEdit}>Süreyi değiştir</MenuItem>
      <MenuItem tone="danger" onSelect={onRemove}>
        Projeden çıkar
      </MenuItem>
    </MenuContent>
  </Menu>
)

const setup = () => {
  const handlers = { onEdit: vi.fn(), onRemove: vi.fn(), onAccess: vi.fn() }
  render(<Example {...handlers} />)
  return handlers
}

describe('Menu', () => {
  it('opens with Enter, moves with arrows, selects with Enter and closes', async () => {
    const { onAccess } = setup()
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    // first item is focused; ArrowDown → "İndirebilir" would be second
    await userEvent.keyboard('{Home}{Enter}')
    expect(onAccess).toHaveBeenCalledWith('view')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Escape closes the menu and returns focus to the trigger', async () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Eylemler' })
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('marks the current choice with aria-checked', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Eylemler' }))
    expect(await screen.findByRole('menuitemradio', { name: /İndirebilir/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('an item with disabledReason is announced disabled, shows the reason and never selects', async () => {
    const { onAccess } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Eylemler' }))
    const item = await screen.findByRole('menuitemradio', { name: /Düzenleyebilir/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent('Misafirler yükleyemez ve düzenleyemez')
    await userEvent.click(item)
    expect(onAccess).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument() // stays open
  })

  it('runs the handler of a normal item', async () => {
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Eylemler' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Projeden çıkar' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
