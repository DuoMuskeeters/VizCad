// @vitest-environment jsdom
// The leave prompt with a real router and blocker (admin.test.tsx mocks the router).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { AdminApp } from './AdminApp'
import { fixtureCmsFetch } from './fixture'

vi.mock('@tanstack/react-start', () => ({ createClientOnlyFn: <F,>(fn: F) => fn }))
vi.mock('./MarkdownEditor.client', () => ({
  default: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <textarea aria-label={label} value={value} onChange={(e: Parameters<NonNullable<ComponentProps<'textarea'>['onChange']>>[0]) => onChange(e.target.value)} />
  ),
}))

const mount = (path: string) => {
  vi.stubGlobal('fetch', fixtureCmsFetch('admin'))
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  const root = createRootRoute({
    component: () => (
      <I18nProvider initialLocale="en">
        <UiProvider>
          <Outlet />
        </UiProvider>
      </I18nProvider>
    ),
  })
  const admin = createRoute({ getParentRoute: () => root, path: 'admin/$', component: AdminApp })
  const router = createRouter({ routeTree: root.addChildren([admin]), history: createMemoryHistory({ initialEntries: [path] }) })
  render(<RouterProvider router={router} />)
  return { confirm, router, user: userEvent.setup() }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('leave prompt', () => {
  it('switching language tabs keeps unsaved text and asks nothing; leaving the post asks', async () => {
    const { confirm, router, user } = mount('/admin/cms/posts/post-1')
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), ' typed')
    await user.click(screen.getByRole('button', { name: /Türkçe|Turkish/ }))
    await waitFor(() => expect(router.state.location.searchStr).toBe('?locale=tr'))
    expect(confirm).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('link', { name: 'Posts' })[0] as HTMLElement)
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    expect(router.state.location.pathname).toBe('/admin/cms/posts/post-1')
  })

  it('after a delete the editor leaves without asking', async () => {
    const { confirm, router, user } = mount('/admin/cms/posts/post-2')
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), ' typed')
    await user.click(screen.getByRole('button', { name: 'Delete post' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/cms/posts'))
    expect(confirm).not.toHaveBeenCalled()
  })
})
