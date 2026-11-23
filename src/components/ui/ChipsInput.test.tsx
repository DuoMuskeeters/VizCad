// @vitest-environment jsdom
import './test-utils'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChipsInput } from './ChipsInput'
import { Field } from './Field'

const Example = () => {
  const [value, setValue] = useState<string[]>([])
  return (
    <Field label="E-posta adresleri">
      <ChipsInput value={value} onValueChange={setValue} />
    </Field>
  )
}

describe('ChipsInput', () => {
  it('Enter, comma and space add valid addresses; duplicates are ignored', async () => {
    render(<Example />)
    const input = screen.getByLabelText('E-posta adresleri')
    await userEvent.type(input, 'elif@firma.com{Enter}kerem@firma.com,elif@firma.com ')
    expect(screen.getByRole('button', { name: 'elif@firma.com kaldır' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'kerem@firma.com kaldır' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps an invalid address in the input and marks it invalid', async () => {
    render(<Example />)
    const input = screen.getByLabelText('E-posta adresleri')
    await userEvent.type(input, 'yanlis{Enter}')
    expect(input).toHaveValue('yanlis')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('Backspace on empty input removes the last chip; the x button removes a chip', async () => {
    render(<Example />)
    const input = screen.getByLabelText('E-posta adresleri')
    await userEvent.type(input, 'a@firma.com{Enter}b@firma.com{Enter}')
    await userEvent.keyboard('{Backspace}')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'a@firma.com kaldır' }))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
