// @vitest-environment jsdom
import './test-utils'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

const Example = () => (
  <Tabs defaultValue="files">
    <TabsList aria-label="Demo">
      <TabsTrigger value="files">Dosyalar</TabsTrigger>
      <TabsTrigger value="access" count={3}>Erişim</TabsTrigger>
      <TabsTrigger value="activity">Aktivite</TabsTrigger>
    </TabsList>
    <TabsContent value="files">Dosyalar paneli</TabsContent>
    <TabsContent value="access">Erişim paneli</TabsContent>
    <TabsContent value="activity">Aktivite paneli</TabsContent>
  </Tabs>
)

describe('Tabs', () => {
  it('shows the default panel and hides others', () => {
    render(<Example />)
    expect(screen.getByText('Dosyalar paneli')).toBeInTheDocument()
    expect(screen.queryByText('Erişim paneli')).not.toBeInTheDocument()
    expect(screen.queryByText('Aktivite paneli')).not.toBeInTheDocument()
  })

  it('switches panel on click', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('tab', { name: /Erişim/ }))
    expect(screen.getByText('Erişim paneli')).toBeInTheDocument()
    expect(screen.queryByText('Dosyalar paneli')).not.toBeInTheDocument()
  })

  it('arrow keys move focus and activate the tab', async () => {
    render(<Example />)
    // Focus the first tab
    await userEvent.click(screen.getByRole('tab', { name: 'Dosyalar' }))
    // ArrowRight activates the next tab
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Erişim/ })).toHaveFocus()
    expect(screen.getByRole('tab', { name: /Erişim/ })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Erişim paneli')).toBeInTheDocument()
  })

  it('renders count label next to tab text', () => {
    render(<Example />)
    // The count span "3" should be visible alongside "Erişim"
    const tab = screen.getByRole('tab', { name: /Erişim/ })
    expect(tab).toHaveTextContent('3')
  })

  it('selected tab has aria-selected=true', async () => {
    render(<Example />)
    expect(screen.getByRole('tab', { name: 'Dosyalar' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /Aktivite/ }))
    expect(screen.getByRole('tab', { name: 'Dosyalar' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /Aktivite/ })).toHaveAttribute('aria-selected', 'true')
  })
})
