// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

const options = [
  { value: 'view', label: 'Görüntüleyebilir', description: 'Modeli açar' },
  { value: 'download', label: 'İndirebilir', description: 'Dosyayı indirir' },
  { value: 'edit', label: 'Düzenleyebilir', disabled: true },
]

describe('Select', () => {
  it('shows the current value as a trigger label', () => {
    render(<Select aria-label="Erişim" options={options} value="download" onValueChange={() => undefined} />)
    expect(screen.getByRole('combobox', { name: 'Erişim' })).toHaveTextContent('İndirebilir')
  })

  it('opens a listbox with the options', async () => {
    render(<Select aria-label="Erişim" options={options} value="view" onValueChange={() => undefined} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Erişim' }))
    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('calls onValueChange when a different option is selected', async () => {
    const onValueChange = vi.fn()
    render(<Select aria-label="Erişim" options={options} value="view" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Erişim' }))
    await userEvent.click(await screen.findByRole('option', { name: /İndirebilir/ }))
    expect(onValueChange).toHaveBeenCalledWith('download')
  })

  it('closes after selecting and updates the trigger label', async () => {
    const onValueChange = vi.fn()
    render(<Select aria-label="Erişim" options={options} defaultValue="view" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Erişim' }))
    await userEvent.click(await screen.findByRole('option', { name: /İndirebilir/ }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('marks the disabled option as such and does not call onValueChange', async () => {
    const onValueChange = vi.fn()
    render(<Select aria-label="Erişim" options={options} value="view" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Erişim' }))
    const disabled = await screen.findByRole('option', { name: /Düzenleyebilir/ })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(disabled)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Select aria-label="Erişim" options={options} value="view" onValueChange={() => undefined} />)
    const trigger = screen.getByRole('combobox', { name: 'Erişim' })
    await userEvent.click(trigger)
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})
