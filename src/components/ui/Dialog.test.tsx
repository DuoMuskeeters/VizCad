// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from './Dialog'
import { Button } from './Button'
import { Input } from './Input'

const Example = () => (
  <>
    <Dialog>
      <DialogTrigger asChild>
        <Button>Paylaş</Button>
      </DialogTrigger>
      <DialogContent
        title="Kişi ekle"
        description="Dosyayı paylaş"
        footer={
          <DialogFooter>
            <DialogClose asChild>
              <Button>Vazgeç</Button>
            </DialogClose>
            <Button variant="primary">Gönder</Button>
          </DialogFooter>
        }
      >
        <Input aria-label="Kime" />
      </DialogContent>
    </Dialog>
    <button type="button">Dışarıdaki düğme</button>
  </>
)

describe('Dialog', () => {
  it('opens named by its title and moves focus inside', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kişi ekle' })
    expect(dialog).toHaveAccessibleDescription('Dosyayı paylaş')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('traps focus: Tab and Shift+Tab never leave the dialog', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 8; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 8; i++) {
      await userEvent.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('Escape closes it and focus returns to the trigger', async () => {
    render(<Example />)
    const trigger = screen.getByRole('button', { name: 'Paylaş' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('has a labelled close button', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kapat' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
