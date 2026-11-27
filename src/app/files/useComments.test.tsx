// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useComments } from './FileTabs'
import { renderApp } from './testApp'

const answer = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })
const comment = (id: string) => ({ id, parentId: null, author: { displayName: 'Ada' }, content: id, deleted: false, createdAt: 1, versionNumber: 1, anchor: null, mine: false, canDelete: false })

const Probe = () => {
  const [fileId, setFileId] = useState('f1')
  const { items } = useComments('w1', fileId)
  return (
    <>
      <button type="button" onClick={() => setFileId('f2')}>other file</button>
      <p data-testid="ids">{items === null ? 'loading' : items.map((item) => item.id).join(',')}</p>
    </>
  )
}

describe('useComments', () => {
  it('shows the first page at once, adds the rest as it comes, and drops a late page of the file left meanwhile', async () => {
    let second: (response: Response) => void = () => {}
    const { user } = renderApp(<Probe />, 'admin', (operation, body) => {
      if (operation !== 'listComments') return undefined
      if (body['fileId'] === 'f2') return answer({ items: [comment('b1')], nextCursor: null })
      if (body['cursor'] === 'p2') return new Promise<Response>((resolve) => {
        second = resolve
      })
      return answer({ items: [comment('a1')], nextCursor: 'p2' })
    })
    // Page 2 is still on its way: page 1 is already there.
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('a1'))
    await user.click(screen.getByRole('button', { name: 'other file' }))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('b1'))
    // The old file's page 2 lands after the switch: it is not this list's.
    await act(async () => second(answer({ items: [comment('a2')], nextCursor: null })))
    await act(async () => {})
    expect(screen.getByTestId('ids')).toHaveTextContent(/^b1$/)
  })

  it('adds the later pages in order once they come', async () => {
    let second: (response: Response) => void = () => {}
    renderApp(<Probe />, 'admin', (operation, body) => {
      if (operation !== 'listComments') return undefined
      if (body['cursor'] === 'p2') return new Promise<Response>((resolve) => {
        second = resolve
      })
      return answer({ items: [comment('a1')], nextCursor: 'p2' })
    })
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent(/^a1$/))
    await act(async () => second(answer({ items: [comment('a2')], nextCursor: null })))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent(/^a1,a2$/))
  })
})
