import { assert, describe, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { MemoryAuth } from '../services/Auth'
import { caller, programLayer, rows, seedFile, seedMember, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess } from './access'
import { createWorkspace, ensurePersonalWorkspace, listMyWorkspaces, selectWorkspace, slugFrom, switchWorkspace } from './workspaces'

const setup = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer()))

describe('createWorkspace', () => {
  it.effect('writes the company, its single owner and one activity row atomically', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      const created = yield* createWorkspace(caller('ada'), { name: 'Acme Ltd' })
      assert.strictEqual(created.kind, 'company')
      assert.match(created.slug, /^acme-ltd-[0-9a-f]{8}$/)
      const members = yield* rows('member')
      assert.deepStrictEqual(members.map((m) => [m.organizationId, m.userId, m.role]), [[created.id, 'ada', 'owner']])
      const log = yield* rows('accessLog')
      assert.deepStrictEqual(log.map((l) => [l.workspaceId, l.actorUserId, l.action, l.targetId, l.requestId]), [[created.id, 'ada', 'workspace.created', created.id, 'ray-test']])
    })))

  it.effect('refuses an unverified account', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada', { emailVerified: false })
      const error = yield* Effect.flip(createWorkspace(caller('ada', { emailVerified: false }), { name: 'Acme' }))
      assert.strictEqual(error._tag, 'EmailUnverified')
      assert.strictEqual((yield* rows('organization')).length, 0)
    })))

  it('slugs stay out of the personal namespace', () => {
    assert.strictEqual(slugFrom('Çelik Yapı A.Ş.', 'abc'), 'celik-yapi-a-s-abc')
    assert.strictEqual(slugFrom('Personal stuff', 'abc'), 'w-personal-stuff-abc')
    assert.strictEqual(slugFrom('!!!', 'abc'), 'workspace-abc')
  })
})

describe('ensurePersonalWorkspace', () => {
  it.effect('is idempotent: one personal workspace, one owner, even when called twice concurrently', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      const [a, b] = yield* Effect.all([ensurePersonalWorkspace(caller('ada')), ensurePersonalWorkspace(caller('ada'))], { concurrency: 2 })
      assert.strictEqual(a, 'personal-ada')
      assert.strictEqual(b, 'personal-ada')
      assert.strictEqual((yield* rows('organization')).length, 1)
      assert.deepStrictEqual((yield* rows('member')).map((m) => m.role), ['owner'])
    })))
})

describe('listMyWorkspaces / switchWorkspace / selectWorkspace', () => {
  const world = Effect.gen(function* () {
    for (const id of ['ada', 'bob', 'eve']) yield* seedUser(id)
    yield* seedWorkspace('pers-ada', 'ada', 'personal')
    yield* seedWorkspace('acme', 'bob')
    yield* seedWorkspace('beta', 'eve')
    yield* seedMember('acme', 'ada', 'admin')
    yield* seedMember('beta', 'ada', 'guest')
    yield* seedFile('f1', 'eve', 'beta')
  })

  it.effect('lists personal and internal memberships with their own role; a guest only with a live grant', () =>
    setup(Effect.gen(function* () {
      yield* world
      const before = yield* listMyWorkspaces(caller('ada'))
      assert.deepStrictEqual(before.map((w) => [w.id, w.role]), [['pers-ada', 'owner'], ['acme', 'admin']])

      yield* grantFileAccess(caller('eve'), { workspaceId: 'beta', fileId: 'f1', userId: 'ada', level: 'comment', expiresAt: T0 + 60 })
      const during = yield* listMyWorkspaces(caller('ada'))
      assert.deepStrictEqual(during.map((w) => [w.id, w.role]), [['pers-ada', 'owner'], ['acme', 'admin'], ['beta', 'guest']])

      yield* TestClock.adjust('60 seconds') // at the expiry instant the grant is dead
      const after = yield* listMyWorkspaces(caller('ada'))
      assert.deepStrictEqual(after.map((w) => w.id), ['pers-ada', 'acme'])
    })))

  it.effect('switchWorkspace stores an allowed selection and refuses others with one answer', () =>
    setup(Effect.gen(function* () {
      yield* world
      const auth = yield* MemoryAuth
      yield* Ref.update(auth, (s) => ({
        ...s,
        workspaces: new Set(['pers-ada', 'acme', 'beta']),
        sessions: new Map([['tok', { sessionId: 's1', userId: 'ada', email: 'ada@example.com', emailVerified: true, accountStatus: 'active' as const, activeWorkspaceId: null }]]),
      }))
      const headers = new Headers({ cookie: 'session=tok' })
      const switched = yield* switchWorkspace(caller('ada'), headers, 'acme')
      assert.strictEqual(switched.workspaceId, 'acme')
      assert.strictEqual((yield* Ref.get(auth)).sessions.get('tok')?.activeWorkspaceId, 'acme')
      for (const target of ['beta', 'nope']) {
        const error = yield* Effect.flip(switchWorkspace(caller('ada'), headers, target))
        assert.strictEqual(error._tag, 'WorkspaceUnavailable')
      }
    })))

  it.effect('selectWorkspace falls back to the personal workspace when the selection is gone', () =>
    setup(Effect.gen(function* () {
      yield* world
      assert.strictEqual(yield* selectWorkspace(caller('ada'), 'acme'), 'acme')
      assert.strictEqual(yield* selectWorkspace(caller('ada'), 'beta'), 'pers-ada')
      assert.strictEqual(yield* selectWorkspace(caller('bob'), null), 'personal-bob')
    })))
})
