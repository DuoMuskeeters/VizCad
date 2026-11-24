// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './Table'

describe('Table', () => {
  it('renders semantic table elements', () => {
    render(
      <Table>
        <TableCaption>Üye Listesi</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Ad</TableHead>
            <TableHead>Rol</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-selected="true">
            <TableCell>Ayşe Yılmaz</TableCell>
            <TableCell>Yönetici</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Üye Listesi')).toBeInTheDocument()
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getAllByRole('cell')).toHaveLength(2)
  })
})
