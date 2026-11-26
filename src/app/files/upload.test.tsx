// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Call } from '../api'
import { FilesPage } from './FilesPage'
import { renderApp } from './testApp'
import { UploadProvider } from './UploadProvider'
import { checkBeforeUpload, runUpload, type Put } from './upload'

vi.mock('@tanstack/react-router', async () => (await import('./routerMock')).routerMock)

const step = (name = 'rotor.step') => new File(['ISO-10303-21;\nHEADER;\nENDSEC;\n'], name, { type: 'application/octet-stream' })

const ticket = { uploadId: 'up-1', url: 'https://r2.example/put', headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }, expiresAt: 9_999_999_999 }
const done = { fileId: 'f9', name: 'rotor.step', extension: 'step', size: 30, versionNumber: 1, isNewVersion: false, maxConvertBytes: 52_428_800 }

const fakeCall = (answers: Record<string, unknown>) => {
  const log: { operation: string; body: Record<string, unknown> }[] = []
  const call = (async (operation: string, body: Record<string, unknown> = {}) => {
    log.push({ operation, body })
    const answer = answers[operation]
    if (typeof answer === 'function') return (answer as () => unknown)()
    return { ok: true, data: answer ?? {} }
  }) as unknown as Call
  return { call, log }
}

const okPut: Put = async ({ onProgress }) => {
  onProgress(0.5)
  return { status: 200, etag: '"abc"' }
}

const base = (call: Call, put: Put, file = step()) => ({ call, put, workspaceId: 'ws-dm', file, signal: new AbortController().signal, onProgress: () => undefined })

describe('upload flow', () => {
  it('requests, puts with the signed headers and completes with the ETag', async () => {
    const { call, log } = fakeCall({ requestUpload: ticket, completeUpload: done })
    const put = vi.fn(okPut)
    const outcome = await runUpload(base(call, put))
    expect(outcome).toEqual({ ok: true, file: done })
    expect(log.map((entry) => entry.operation)).toEqual(['requestUpload', 'completeUpload'])
    expect(log[0]?.body).toEqual({ workspaceId: 'ws-dm', name: 'rotor.step', size: 30 })
    expect(put.mock.calls[0]?.[0]).toMatchObject({ url: ticket.url, headers: ticket.headers })
    expect(log[1]?.body).toEqual({ uploadId: 'up-1', etag: '"abc"' })
  })

  it('sends the file id when uploading a new version', async () => {
    const { call, log } = fakeCall({ requestUpload: ticket, completeUpload: { ...done, isNewVersion: true } })
    await runUpload({ ...base(call, okPut), targetFileId: 'f1' })
    expect(log[0]?.body['targetFileId']).toBe('f1')
  })

  it('rejects an unsupported type before any request', async () => {
    const { call, log } = fakeCall({})
    expect(await runUpload(base(call, okPut, step('rotor.dwg')))).toEqual({ ok: false, canceled: false, reason: 'unsupported' })
    expect(log).toHaveLength(0)
  })

  it('rejects content that does not match the type (an HTML page named .stl)', async () => {
    expect(await checkBeforeUpload(new File(['<html><body>hi</body></html>'], 'fake.stl'))).toBe('unsupported')
    expect(await checkBeforeUpload(step())).toBeNull()
  })

  it.each([
    ['UnsupportedFileType', 415, 'unsupported'],
    ['FileTooLarge', 413, 'tooLarge'],
    ['StorageQuotaExceeded', 409, 'quota'],
    ['UploadLimitReached', 429, 'limit'],
    ['PermissionDenied', 403, 'denied'],
    ['VersionTypeMismatch', 422, 'versionType'],
  ])('maps the server error %s to %s', async (error, status, reason) => {
    const { call } = fakeCall({ requestUpload: () => ({ ok: false, status, error }) })
    expect(await runUpload(base(call, okPut))).toEqual({ ok: false, canceled: false, reason })
  })

  it('maps the single-write refusal (412) to a conflict and an unexpected status to a failure, cancelling the session on the latter', async () => {
    const { call, log } = fakeCall({ requestUpload: ticket })
    expect(await runUpload(base(call, async () => ({ status: 412, etag: null })))).toEqual({ ok: false, canceled: false, reason: 'conflict' })
    expect(await runUpload(base(call, async () => ({ status: 403, etag: null })))).toEqual({ ok: false, canceled: false, reason: 'failed' })
    expect(log.filter((entry) => entry.operation === 'cancelUpload')).toHaveLength(1)
  })

  it('reports a dropped connection as network and releases the reservation', async () => {
    const { call, log } = fakeCall({ requestUpload: ticket })
    const outcome = await runUpload(base(call, async () => Promise.reject(new Error('network'))))
    expect(outcome).toEqual({ ok: false, canceled: false, reason: 'network' })
    expect(log.some((entry) => entry.operation === 'cancelUpload' && entry.body['uploadId'] === 'up-1')).toBe(true)
  })

  it('cancels: aborting during the PUT calls cancelUpload and never completes', async () => {
    const { call, log } = fakeCall({ requestUpload: ticket })
    const controller = new AbortController()
    const put: Put = ({ signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))
    const running = runUpload({ ...base(call, put), signal: controller.signal })
    await waitFor(() => expect(log.some((entry) => entry.operation === 'requestUpload')).toBe(true))
    await Promise.resolve()
    controller.abort()
    expect(await running).toEqual({ ok: false, canceled: true })
    expect(log.map((entry) => entry.operation)).toEqual(['requestUpload', 'cancelUpload'])
  })

  it('maps a mismatch on completion to a rejected file', async () => {
    const { call } = fakeCall({ requestUpload: ticket, completeUpload: () => ({ ok: false, status: 422, error: 'UploadMismatch' }) })
    expect(await runUpload(base(call, okPut))).toEqual({ ok: false, canceled: false, reason: 'rejected' })
  })
})

describe('progress card', () => {
  it('uploads a chosen file, shows it done and refreshes the list', async () => {
    const { calls, user } = renderApp(
      <UploadProvider put={okPut}>
        <FilesPage />
      </UploadProvider>,
      'admin',
    )
    await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })
    await user.upload(screen.getByLabelText('Choose files to upload'), [step('Yeni_parça.step')])
    const card = await screen.findByRole('region', { name: 'Uploads' })
    await waitFor(() => expect(within(card).getByText(/^Uploaded · /)).toBeInTheDocument())
    expect(calls.map((c) => c.operation)).toEqual(expect.arrayContaining(['requestUpload', 'completeUpload']))
    expect(await screen.findByRole('link', { name: 'Yeni_parça.step' })).toBeInTheDocument()
  })

  it('shows the unsupported-type message for a dropped .dwg and does not request an upload', async () => {
    const { calls } = renderApp(
      <UploadProvider put={okPut}>
        <FilesPage />
      </UploadProvider>,
      'admin',
    )
    await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })
    fireEvent.change(screen.getByLabelText('Choose files to upload'), { target: { files: [new File(['x'], 'rotor.dwg')] } })
    const card = await screen.findByRole('region', { name: 'Uploads' })
    expect(within(card).getByText(/rotor\.dwg was not uploaded: this file type is not supported\. Supported: STEP/)).toBeInTheDocument()
    expect(calls.some((c) => c.operation === 'requestUpload')).toBe(false)
  })

  it('offers a retry after a network failure', async () => {
    let attempts = 0
    const put: Put = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network')
      return { status: 200, etag: '"abc"' }
    }
    const { user } = renderApp(
      <UploadProvider put={put}>
        <FilesPage />
      </UploadProvider>,
      'admin',
    )
    await screen.findByRole('link', { name: 'Flanş_DN100_rev3.step' })
    await user.upload(screen.getByLabelText('Choose files to upload'), [step('Mil.step')])
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/^Uploaded · /)).toBeInTheDocument()
  })

  it('disables the upload button with a reason for a commenter', async () => {
    renderApp(
      <UploadProvider put={okPut}>
        <FilesPage />
      </UploadProvider>,
      'files-commenter',
    )
    const buttons = await screen.findAllByRole('button', { name: /Upload/ })
    expect(buttons.some((button) => button.getAttribute('aria-disabled') === 'true')).toBe(true)
  })
})
