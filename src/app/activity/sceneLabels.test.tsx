// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityTab } from '#/app/files/FileTabs'
import { renderApp } from '#/app/files/testApp'
import { ActivityList } from './ActivityList'

vi.mock('@tanstack/react-router', async () => (await import('../files/routerMock')).routerMock)

const answer = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } })

describe('scene.updated in the activity', () => {
  it('has its own label in the workspace list', async () => {
    renderApp(
      <ActivityList items={[{ id: 'a1', actorKind: 'user', actorUserId: 'u1', actorName: 'Ada', targetKind: 'file', targetId: 'f1', action: 'scene.updated', outcome: 'allowed', createdAt: 1 }]} />,
      'admin',
    )
    expect(await screen.findByText(/changed the appearance of a file\./)).toBeInTheDocument()
  })

  it("has its own label in the file's Activity tab", async () => {
    renderApp(<ActivityTab workspaceId="w1" fileId="f1" can={{ edit: true } as never} />, 'admin', (op) =>
      op === 'listFileActivity' ? answer({ items: [{ id: 'a1', action: 'scene.updated', createdAt: 1, actor: { kind: 'user', displayName: 'Ada' } }], nextCursor: null }) : undefined,
    )
    expect(await screen.findByText('Ada changed the appearance')).toBeInTheDocument()
  })
})
