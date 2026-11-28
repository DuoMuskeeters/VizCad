// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { AdminLayout } from './AdminLayout'
import { type AdminScenario, fixtureCmsFetch } from './fixture'
import type { AdminPost } from '#/shared/cmsTypes'
import { PostEditor } from './PostEditor'
import { PostsPage } from './PostsPage'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/admin/cms/posts', searchStr: '' }),
  useBlocker: () => undefined,
  useParams: () => ({ _splat: 'cms/posts' }),
}))
vi.mock('@tanstack/react-start', () => ({ createClientOnlyFn: <F,>(fn: F) => fn }))
// CodeMirror needs layout APIs jsdom lacks; the editor's contract (value in, onChange out) is what the screen relies on.
vi.mock('./MarkdownEditor.client', () => ({
  default: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <textarea aria-label={label} value={value} onChange={(e: Parameters<NonNullable<ComponentProps<'textarea'>['onChange']>>[0]) => onChange(e.target.value)} />
  ),
}))

type Call = { operation: string; body: Record<string, unknown> }

const mount = (ui: React.ReactNode, scenario: AdminScenario = 'admin') => {
  const calls: Array<Call> = []
  const inner = fixtureCmsFetch(scenario)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ operation: url.split('/api/cms/')[1] ?? '', body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
    return inner(input, init)
  })
  render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <AdminLayout>{ui}</AdminLayout>
      </UiProvider>
    </I18nProvider>,
  )
  return { calls, user: userEvent.setup() }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  navigate.mockReset()
})

describe('admin gate', () => {
  it('a non-admin sees why, an anonymous visitor is asked to sign in; no screen loads', async () => {
    const denied = mount(<PostsPage />, 'admin-denied')
    expect(await screen.findByText('This area is for platform admins only.')).toBeInTheDocument()
    expect(denied.calls.map((c) => c.operation)).toEqual(['listPurges'])
    cleanup()
    mount(<PostsPage />, 'admin-anon')
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Fadmin%2Fcms%2Fposts')
  })

  it('without purge config a red banner says publishing is off, and Publish explains it', async () => {
    mount(<PostEditor postId="post-2" locale="en" />, 'admin-nopurge')
    expect(await screen.findByText('Cache purging is not configured; publishing is off.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Publish' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('posts list', () => {
  it('shows status and language coverage in words, not only marks', async () => {
    mount(<PostsPage />)
    const row = (await screen.findByText('STEP vs IGES: which neutral CAD format to send')).closest('a') as HTMLElement
    expect(row).toHaveAttribute('href', '/admin/cms/posts/post-1')
    expect(within(row).getByText('Published')).toBeInTheDocument()
    expect(row.textContent).toContain(': live')
    expect(row.textContent).toContain(': draft')
  })

  it('an empty CMS invites the first post', async () => {
    mount(<PostsPage />, 'admin-empty')
    expect(await screen.findByText('No posts yet. Create the first post.')).toBeInTheDocument()
  })

  it('creates a post and opens its editor', async () => {
    const { calls, user } = mount(<PostsPage />)
    await user.click(await screen.findByRole('button', { name: 'New post' }))
    await user.type(await screen.findByRole('textbox', { name: /Title \(English\)/ }), 'Fresh post')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: '/admin/cms/posts/new-1' }))
    expect(calls.find((c) => c.operation === 'createPost')?.body).toEqual({ title: 'Fresh post' })
  })
})

describe('post editor', () => {
  it('saves the changed draft, then publishes it with the new revision and reports the purge', async () => {
    const { calls, user } = mount(<PostEditor postId="post-1" locale="en" />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'New title')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Published · cache purged: 8 URLs')).toBeInTheDocument()
    const save = calls.find((c) => c.operation === 'saveDraft')
    expect(save?.body).toMatchObject({ postId: 'post-1', locale: 'en', fields: { title: 'New title' }, revision: 1_795_514_400 - 2 * 86_400 })
    expect(calls.find((c) => c.operation === 'publishTranslation')?.body).toEqual({ postId: 'post-1', locale: 'en', revision: 1_795_514_400 - 2 * 86_400 + 1 })
    expect(await screen.findByText('Purging the cache · 8 left')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('a missing field is marked under the field (PublishBlocked invalid-fields)', async () => {
    const { user } = mount(<PostEditor postId="post-2" locale="en" />)
    await user.click(await screen.findByRole('button', { name: 'Publish' }))
    const excerpt = await screen.findByRole('textbox', { name: 'Excerpt' })
    await waitFor(() => expect(excerpt).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getAllByText('Required.').length).toBeGreaterThan(0)
  })

  it('a closed blog locale (D9) can be drafted but Publish says why it is off', async () => {
    mount(<PostEditor postId="post-1" locale="tr" />)
    expect(await screen.findByText('The blog is English only for now (D9). This language can be drafted but not published yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('a stale copy shows the conflict with a reload action', async () => {
    const { user } = mount(<PostEditor postId="post-1" locale="tr" />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await user.type(title, '!')
    // Someone else saved meanwhile: the fixture answers ContentConflict for an old revision.
    const fetcher = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/saveDraft') ? new Response(JSON.stringify({ ok: false, error: 'ContentConflict' }), { status: 409 }) : fetcher(input, init),
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Someone else changed this post. Reload to see their version.')).toBeInTheDocument()
    // Reload shows their version: the server's copy now has another title.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetcher(input, init)
      if (!String(input).endsWith('/getPostAdmin')) return response
      const body = (await response.json()) as { data: AdminPost }
      const tr = body.data.locales.tr
      return Response.json({ ok: true, data: { ...body.data, locales: { ...body.data.locales, tr: { ...tr, draft: tr.draft && { ...tr.draft, title: 'Their title' }, revision: 5 } } } })
    })
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Their title'))
    expect(screen.queryByText('Someone else changed this post. Reload to see their version.')).not.toBeInTheDocument()
  })

  it('Save details keeps unsaved text of the translation, with its old revision', async () => {
    const { calls, user } = mount(<PostEditor postId="post-1" locale="tr" />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await user.type(title, ' typed')
    const category = screen.getByRole('textbox', { name: 'Category' })
    await user.clear(category)
    await user.type(category, 'Guides')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(calls.filter((c) => c.operation === 'getPostAdmin')).toHaveLength(2))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('STEP mi IGES mi? typed')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'saveDraft')?.body).toMatchObject({ fields: { title: 'STEP mi IGES mi? typed' }, revision: 4 }))
  })

  it('a title over the limit is refused under the field (TextTooLong)', async () => {
    const { user } = mount(<PostEditor postId="post-1" locale="tr" />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    // The input caps at 120; the server is the authority, so drive it past the cap through the API answer.
    const original = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/saveDraft') ? new Response(JSON.stringify({ ok: false, error: 'TextTooLong', field: 'title', max: 120 }), { status: 422 }) : original(input, init),
    )
    await user.type(title, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Too long: at most 120.')).toBeInTheDocument()
  })
})
