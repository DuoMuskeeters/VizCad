// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'
import { Input, Textarea } from './Input'

describe('Field', () => {
  it('links label, hint and error to the control', () => {
    render(
      <Field label="E-posta" hint="İş adresini yaz" error="Geçerli bir adres değil">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('E-posta')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(ids).toHaveLength(2)
    expect(input).toHaveAccessibleDescription('İş adresini yaz Geçerli bir adres değil')
    expect(screen.getByRole('alert')).toHaveTextContent('Geçerli bir adres değil')
  })

  it('without hint or error there is no aria-describedby and the control is valid', () => {
    render(
      <Field label="Ad">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Ad')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('works for a Textarea and marks required', () => {
    render(
      <Field label="Mesaj" hint="İsteğe bağlı" required>
        <Textarea />
      </Field>,
    )
    const area = screen.getByLabelText('Mesaj')
    expect(area).toHaveAttribute('aria-required', 'true')
    expect(area).toHaveAccessibleDescription('İsteğe bağlı')
  })
})
