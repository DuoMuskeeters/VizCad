// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '#/components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { AdminLayout } from './AdminLayout'
import { type AdminScenario, fixtureCmsFetch } from './fixture'
import { AssetsPage } from './AssetsPage'
import { AuthorsPage } from './AuthorsPage'
import { CachePage } from './CachePage'
import { PostEditor } from './PostEditor'

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
  default: ({ value, onChange, label, labels, onImage }: { value: string; onChange: (v: string) => void; label: string; labels: { image: string }; onImage?: (insert: (md: string) => void) => void }) => (
    <>
      <textarea aria-label={label} value={value} onChange={(e: Parameters<NonNullable<ComponentProps<'textarea'>['onChange']>>[0]) => onChange(e.target.value)} />
      <button type="button" onClick={() => onImage?.((md) => onChange(`${value}${md}`))}>{labels.image}</button>
    </>
  ),
}))

type Call = { operation: string; body: Record<string, unknown> }

const mount = (ui: ReactNode, scenario: AdminScenario = 'admin') => {
  const calls: Array<Call> = []
  const inner = fixtureCmsFetch(scenario)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ operation: url.split('/api/cms/')[1] ?? '', body: init?.body instanceof Blob ? {} : (JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>) })
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

describe('authors screen', () => {
  it('lists authors with their posts; an author with posts cannot be deleted and says why', async () => {
    const { user } = mount(<AuthorsPage />)
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/2 posts/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0] as HTMLElement)
    expect(await screen.findByRole('button', { name: 'Delete author' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getAllByText('This author has posts. Give them to another author first.').length).toBeGreaterThan(0)
  })

  it('edits per-language job title and bio and saves them with the lock', async () => {
    const { user, calls } = mount(<AuthorsPage />)
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0] as HTMLElement)
    await user.click(await screen.findByRole('tab', { name: /^tr/i }))
    const bio = screen.getByRole('textbox', { name: 'Bio' })
    expect(bio).toHaveValue('CAD biçimleri üzerine yazar.')
    await user.clear(bio)
    await user.type(bio, 'Yeni biyografi')
    await user.click(screen.getByRole('tab', { name: /^en/i }))
    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveValue('Writes about CAD formats.')
    await user.click(screen.getByRole('button', { name: 'Save author' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'saveAuthor')).toBe(true))
    const body = calls.find((c) => c.operation === 'saveAuthor')?.body as { translations: Record<string, { bio: string }>; revision: number; authorId: string }
    expect(body.translations['tr']?.bio).toBe('Yeni biyografi')
    expect(body.translations['en']?.bio).toBe('Writes about CAD formats.')
    expect(body.authorId).toBe('author-ada')
    expect(body.revision).toBe(1_795_514_400 - 86_400)
    expect(await screen.findByText('Author saved · cache purged: 3 URLs')).toBeInTheDocument()
  })

  it('a non-https profile link and a taken slug are shown under their fields', async () => {
    const { user } = mount(<AuthorsPage />)
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[1] as HTMLElement)
    await user.type(await screen.findByRole('textbox', { name: /Profiles/ }), 'http://plain.dev')
    await user.click(screen.getByRole('button', { name: 'Save author' }))
    expect(await screen.findByText('Only https addresses.')).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: /Profiles/ }))
    await user.type(screen.getByRole('textbox', { name: /Slug/ }), 'taken')
    await user.click(screen.getByRole('button', { name: 'Save author' }))
    expect(await screen.findByText('Another author uses this slug.')).toBeInTheDocument()
  })
})

describe('images screen', () => {
  it('an image in use cannot be deleted and lists where it is used; an unused one is deleted after confirming', async () => {
    const { user, calls } = mount(<AssetsPage />)
    await user.click(await screen.findByRole('button', { name: /A STEP assembly in the viewer/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true')
    expect(await within(dialog).findByText('post cover or legacy text')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Unused/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Image deleted')).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'deleteAsset' && c.body['assetId'] === 'asset-1')).toBe(true)
  })

  it('saves the alt text', async () => {
    const { user, calls } = mount(<AssetsPage />)
    await user.click(await screen.findByRole('button', { name: /Unused/ }))
    const alt = await screen.findByRole('textbox', { name: /Alt text/ })
    await user.type(alt, 'A bracket')
    await user.click(screen.getByRole('button', { name: 'Save alt text' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'updateAssetAlt')?.body).toEqual({ assetId: 'asset-1', alt: 'A bracket' }))
  })
})

describe('cache screen', () => {
  it('lists the queue with failures; retry and clear act on the selected failed rows only', async () => {
    const { user, calls } = mount(<CachePage />)
    expect(await screen.findByText('https://staging.viz-cad.com/blog/step-vs-iges')).toBeInTheDocument()
    expect(screen.getByText('3 waiting · 2 failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry selected' })).toHaveAttribute('aria-disabled', 'true')
    // Only failed rows can be selected.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    await user.click(screen.getByRole('checkbox', { name: /step-vs-iges/ }))
    await user.click(screen.getByRole('button', { name: 'Retry selected' }))
    expect(await screen.findByText('1 row queued again')).toBeInTheDocument()
    expect(calls.find((c) => c.operation === 'retryPurges')?.body).toEqual({ ids: [1] })
    await user.click(await screen.findByRole('button', { name: 'Select every failed row' }))
    await user.click(screen.getByRole('button', { name: 'Clear selected' }))
    expect(await screen.findByText('1 row cleared')).toBeInTheDocument()
  })

  it('a manual purge of a URL off the site is refused under the field; the host purge asks first', async () => {
    const { user, calls } = mount(<CachePage />)
    await user.type(await screen.findByRole('textbox', { name: /Purge URLs/ }), 'ftp://elsewhere')
    await user.click(screen.getByRole('button', { name: 'Purge these URLs' }))
    expect(await screen.findByText('Only cached pages of this site can be purged.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Purge host' }))
    expect(calls.some((c) => c.operation === 'purgeHost')).toBe(false)
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Purge host' }))
    expect(await screen.findByText('Host purge sent')).toBeInTheDocument()
  })
})

describe('editor 6c-2', () => {
  it('Details fields survive switching to SEO and back', async () => {
    const { user } = mount(<PostEditor postId="post-1" locale="en" />)
    const category = await screen.findByRole('textbox', { name: 'Category' })
    await user.clear(category)
    await user.type(category, 'tutorials')
    await user.click(screen.getByRole('tab', { name: 'SEO' }))
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByRole('textbox', { name: 'Category' })).toHaveValue('tutorials')
  })

  it('the toolbar image button picks from the library and inserts the image with its alt text', async () => {
    const { user } = mount(<PostEditor postId="post-2" locale="en" />)
    await user.click(await screen.findByRole('button', { name: 'Image' }))
    await user.click(await screen.findByRole('button', { name: /A STEP assembly in the viewer/ }))
    const alt = await screen.findByRole('textbox', { name: /Alt text for this image/ })
    expect(alt).toHaveValue('A STEP assembly in the viewer')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Text (Markdown)' }) as HTMLTextAreaElement).value).toContain('![A STEP assembly in the viewer](data:image/svg+xml'))
  })

  it('choosing a cover sends its asset id with the post fields', async () => {
    const { user, calls } = mount(<PostEditor postId="post-1" locale="en" />)
    await user.click(await screen.findByRole('button', { name: 'Choose cover' }))
    await user.click(await screen.findByRole('button', { name: /Unused|800 × 600/ }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'updatePostMeta')?.body['coverAssetId']).toBe('asset-1'))
  })

  it('Preview opens its tab inside the click, before the save round trip (Safari)', async () => {
    const order: Array<string> = []
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      order.push('open')
      return tab as unknown as Window
    })
    const { user, calls } = mount(<PostEditor postId="post-2" locale="en" />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await user.type(title, ' more')
    const before = calls.length
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(tab.location.href).toBe('/admin/cms/preview/post/post-2/en'))
    expect(order).toEqual(['open'])
    expect(calls.slice(before).map((c) => c.operation)).toEqual(['saveDraft'])
    expect(tab.opener).toBeNull()
    open.mockRestore()
  })
})
