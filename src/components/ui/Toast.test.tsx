// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast, type ToastInput } from './Toast'

// A button that fires toasts for testing.
const Trigger = ({ input }: { input: ToastInput }) => {
  const { toast } = useToast()
  return <button type="button" onClick={() => toast(input)}>Bildirim</button>
}

const setup = (input: ToastInput) => {
  render(
    <ToastProvider>
      <Trigger input={input} />
    </ToastProvider>,
  )
  return screen.getByRole('button', { name: 'Bildirim' })
}

describe('Toast', () => {
  it('shows a toast after the trigger is clicked', async () => {
    const btn = setup({ title: 'Dosya silindi' })
    await userEvent.click(btn)
    expect(await screen.findByText('Dosya silindi')).toBeInTheDocument()
  })

  it('renders an optional description', async () => {
    const btn = setup({ title: 'Hata', description: 'Sunucu yanıt vermedi' })
    await userEvent.click(btn)
    expect(await screen.findByText('Sunucu yanıt vermedi')).toBeInTheDocument()
  })

  it('renders an action button that runs the callback', async () => {
    const onClick = vi.fn()
    const btn = setup({ title: 'Çöpe taşındı', action: { label: 'Geri al', onClick } })
    await userEvent.click(btn)
    const action = await screen.findByRole('button', { name: 'Geri al' })
    await userEvent.click(action)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('closes when the X button is clicked', async () => {
    const btn = setup({ title: 'İşlem tamam' })
    await userEvent.click(btn)
    const toast = await screen.findByText('İşlem tamam')
    const close = screen.getByRole('button', { name: 'Kapat' })
    await userEvent.click(close)
    await waitFor(() => expect(toast).not.toBeInTheDocument())
  })

  it('stacks multiple toasts independently', async () => {
    const btn = setup({ title: 'İlk bildirim' })
    await userEvent.click(btn)
    await userEvent.click(btn)
    const all = await screen.findAllByText('İlk bildirim')
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('shows success tone icon (renders without throwing)', async () => {
    const btn = setup({ title: 'Kaydedildi', tone: 'success' })
    await userEvent.click(btn)
    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument()
  })

  it('shows danger tone icon (renders without throwing)', async () => {
    const btn = setup({ title: 'Hata oluştu', tone: 'danger' })
    await userEvent.click(btn)
    expect(await screen.findByText('Hata oluştu')).toBeInTheDocument()
  })
})
