// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { FileDetailPage } from './FileDetailPage'
import { failure, renderApp } from './testApp'
import { UploadProvider } from './UploadProvider'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const page = () => (
  <UploadProvider>
    <FileDetailPage />
  </UploadProvider>
)

describe('file page', () => {
  it('shows the file card with a download and the details tab', async () => {
    renderApp(page(), 'admin')
    expect(await screen.findByRole('heading', { level: 1, name: 'Flanş_DN100_rev3.step' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByText('STEP · 12.4 MB')).toBeInTheDocument()
    expect(screen.getByText('Pompa revizyonu')).toBeInTheDocument()
    expect(screen.getByText('No thumbnail yet.')).toBeInTheDocument()
  })

  it('says so when the file does not exist for this person', async () => {
    renderApp(page(), 'admin', (operation) => (operation === 'getFile' ? failure(404, 'ResourceUnavailable') : undefined))
    expect(await screen.findByText('This file is not available')).toBeInTheDocument()
  })
})

describe('comments', () => {
  it('lists threads with replies and the deleted tombstone, and writes a new comment', async () => {
    const { calls, user } = renderApp(page(), 'admin')
    await user.click(await screen.findByRole('tab', { name: 'Comments' }))
    expect(await screen.findByText(/Cıvata dairesi çapını/)).toBeInTheDocument()
    expect(screen.getByText('Kontrol ettim, 3. sürümde düzelttim.')).toBeInTheDocument()
    expect(screen.getByText('Comment deleted')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Write a comment' }), 'Yeni not')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText('Yeni not')).toBeInTheDocument()
    const sent = calls.find((c) => c.operation === 'addComment')
    expect(sent?.body).toMatchObject({ workspaceId: 'ws-dm', fileId: 'f1', content: 'Yeni not' })
    expect(sent?.body).not.toHaveProperty('parentId')
  })

  it('replies to a comment with its id as parent', async () => {
    const { calls, user } = renderApp(page(), 'admin')
    await user.click(await screen.findByRole('tab', { name: 'Comments' }))
    await screen.findByText(/Cıvata dairesi çapını/)
    await user.click(screen.getAllByRole('button', { name: 'Reply' })[0] as HTMLElement)
    expect(screen.getByText('Replying to Mehmet Kaya')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Write a comment' }), 'Teşekkürler')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'addComment')?.body['parentId']).toBe('c1'))
  })

  it('deletes a comment the person may delete and leaves a tombstone', async () => {
    const { calls, user } = renderApp(page(), 'admin')
    await user.click(await screen.findByRole('tab', { name: 'Comments' }))
    const mine = await screen.findByText('Kontrol ettim, 3. sürümde düzelttim.')
    await user.click(within(mine.closest('div.grid') as HTMLElement).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.some((c) => c.operation === 'deleteComment' && c.body['commentId'] === 'c2')).toBe(true))
    await waitFor(() => expect(screen.queryByText('Kontrol ettim, 3. sürümde düzelttim.')).not.toBeInTheDocument())
  })

  it('shows the server error text when a comment is refused', async () => {
    const { user } = renderApp(page(), 'admin', (operation) => (operation === 'addComment' ? failure(429, 'RateLimitExceeded') : undefined))
    await user.click(await screen.findByRole('tab', { name: 'Comments' }))
    await user.type(await screen.findByRole('textbox', { name: 'Write a comment' }), 'x')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText('Too many requests. Wait a few minutes and try again.')).toBeInTheDocument()
  })
})

describe('activity and versions', () => {
  it('writes activity as sentences', async () => {
    const { user } = renderApp(page(), 'admin')
    await user.click(await screen.findByRole('tab', { name: 'Activity' }))
    expect(await screen.findByText('Anyone with the link opened the link')).toBeInTheDocument()
    expect(screen.getByText('Ayşe Yılmaz uploaded a new version')).toBeInTheDocument()
  })

  it('a commenter sees the reason instead of the activity', async () => {
    const { user } = renderApp(page(), 'files-commenter')
    await user.click(await screen.findByRole('tab', { name: 'Activity' }))
    expect(await screen.findByText('Only people who can edit the file see its activity.')).toBeInTheDocument()
  })

  it('lists versions with the current one marked and restores an older one', async () => {
    const { calls, user } = renderApp(page(), 'admin')
    await user.click(await screen.findByRole('tab', { name: 'Versions' }))
    expect(await screen.findByText('Version 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore version 2' }))
    await waitFor(() => expect(calls.find((c) => c.operation === 'restoreVersion')?.body).toMatchObject({ fileId: 'f1', versionId: 'v-f1-2' }))
    expect(await screen.findByText('Version 2 is current again as a new version.')).toBeInTheDocument()
  })

  it('a single version gets the empty text', async () => {
    const { user } = renderApp(page(), 'files-one-version')
    await user.click(await screen.findByRole('tab', { name: 'Versions' }))
    expect(await screen.findByText(/There is one version\./)).toBeInTheDocument()
  })

  it('a commenter cannot restore or upload a version: the buttons say why', async () => {
    const { user } = renderApp(page(), 'files-commenter')
    await user.click(await screen.findByRole('tab', { name: 'Versions' }))
    const restore = await screen.findByRole('button', { name: 'Restore version 2' })
    expect(restore).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /Upload a new version/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('uploads a new version for this file', async () => {
    const { calls, user } = renderApp(
      <UploadProvider put={async () => ({ status: 200, etag: '"e"' })}>
        <FileDetailPage />
      </UploadProvider>,
      'admin',
    )
    await user.click(await screen.findByRole('tab', { name: 'Versions' }))
    await screen.findByText('Version 3')
    await user.click(screen.getByRole('button', { name: /Upload a new version/ }))
    await user.upload(screen.getByLabelText('Choose files to upload'), new File(['ISO-10303-21;\nx'], 'Flanş_DN100_rev3.step'))
    await waitFor(() => expect(calls.find((c) => c.operation === 'requestUpload')?.body['targetFileId']).toBe('f1'))
    await waitFor(() => expect(calls.some((c) => c.operation === 'completeUpload')).toBe(true))
  })
})
