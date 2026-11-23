// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, IconButton } from './Button'

describe('Button', () => {
  it('runs onClick when enabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Kaydet</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('disabledReason: stays focusable, is aria-disabled, ignores clicks and exposes the reason as its description', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" disabledReason="İndirme izni yok, sahibinden iste" onClick={onClick}>
        İndir
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'İndir' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAccessibleDescription('İndirme izni yok, sahibinden iste')

    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.click(button)
    await userEvent.keyboard('{Enter}')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabledReason: tapping the button shows the reason in a tooltip (touch has no hover)', async () => {
    render(<Button disabledReason="Koltuk kalmadı">Davet et</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Davet et' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Koltuk kalmadı')
  })

  it('plain disabled uses the native attribute', () => {
    render(<Button disabled>Sil</Button>)
    expect(screen.getByRole('button', { name: 'Sil' })).toBeDisabled()
  })

  it('loading: busy, no clicks, keeps its label', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Gönder
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Gönder' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('IconButton is named by its required label', () => {
    render(
      <IconButton label="Diğer eylemler">
        <svg aria-hidden />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Diğer eylemler' })).toBeInTheDocument()
  })
})
