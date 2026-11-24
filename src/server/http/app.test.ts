import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { MemoryAuth, type SessionSummary } from '../services/Auth'
import { defaultPlan } from '../services/Entitlements'
import { programLayer, rows, seedMember, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { type AppServices, appResponse, operationNames } from './app'

const ORIGIN = 'https://vizcad.test'
const meta = { requestId: 'ray-1' }

const post = (operation: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${ORIGIN}/api/app/${operation}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'session=tok-ada', 'cf-ray': 'ray-1', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

const session = (userId: string, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: `s-${userId}`, userId, email: `${userId}@example.com`, emailVerified: true, accountStatus: 'active', activeWorkspaceId: null, ...overrides,
})

/** Runs the handler against the test's own in-memory services (so seeded rows are visible to it). */
const call = (request: Request) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<AppServices>()
    const response = yield* appResponse(request, Layer.succeedContext(context), meta)
    const body = yield* Effect.promise(() => response.json() as Promise<{ ok: boolean; data?: unknown; error?: string; reason?: string }>)
    return { status: response.status, body, headers: response.headers }
  })

const run = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(
    Effect.andThen(Effect.gen(function* () {
      for (const id of ['ada', 'bob', 'new']) yield* seedUser(id)
      yield* seedWorkspace('acme', 'bob')
      yield* seedMember('acme', 'ada', 'member')
      const auth = yield* MemoryAuth
      yield* Ref.update(auth, (s) => ({
        ...s,
        workspaces: new Set(['acme']),
        sessions: new Map([
          ['tok-ada', session('ada')],
          ['tok-bob', session('bob')],
          ['tok-new', session('new')],
          ['tok-banned', session('new', { accountStatus: 'suspended' })],
        ]),
      }))
    })),
    Effect.andThen(body),
    Effect.provide(programLayer({ ...defaultPlan })),
  )

describe('POST /api/app/<operation>', () => {
  it.effect('runs the program and answers private, no-store JSON', () =>
    run(Effect.gen(function* () {
      const { status, body, headers } = yield* call(post('createWorkspace', { name: '  Acme Two ' }))
      assert.strictEqual(status, 200)
      assert.strictEqual(headers.get('cache-control'), 'private, no-store')
      assert.isTrue(body.ok)
      assert.strictEqual((body.data as { name: string }).name, 'Acme Two')
      const log = yield* rows('accessLog')
      assert.deepStrictEqual(log.map((l) => [l.actorUserId, l.requestId]), [['ada', 'ray-1']])
    })))

  it.effect('unknown operations (including prototype keys) are 404', () =>
    run(Effect.gen(function* () {
      for (const name of ['nope', 'toString', '__proto__', 'createWorkspace/extra', '']) {
        assert.strictEqual((yield* call(post(name, {}))).status, 404, name)
      }
    })))

  it.effect('CSRF: GET, foreign origin, cross-site fetch and form bodies are refused before the session is read', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, {}, 'GET'))).status, 403)
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, { origin: 'https://evil.test' }))).status, 403)
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, { 'sec-fetch-site': 'cross-site' }))).status, 403)
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, { 'content-type': 'text/plain' }))).status, 403)
    })))

  it.effect('no session or a suspended account is 401', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, { cookie: '' }))).status, 401)
      assert.strictEqual((yield* call(post('listMyWorkspaces', {}, { cookie: 'session=tok-banned' }))).status, 401)
    })))

  it.effect('bodies are validated by Schema: wrong types, excess fields and bad emails are 400', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('createWorkspace', { name: '' }))).status, 400)
      assert.strictEqual((yield* call(post('createWorkspace', { name: 'a\nb' }))).status, 400)
      assert.strictEqual((yield* call(post('createWorkspace', { name: 'Acme', kind: 'personal' }))).status, 400)
      assert.strictEqual((yield* call(post('inviteMember', { workspaceId: 'acme', email: 'not-an-email', role: 'member' }, { cookie: 'session=tok-bob' }))).status, 400)
      assert.strictEqual((yield* call(post('inviteMember', { workspaceId: 'acme', email: 'x@example.com', role: 'owner' }, { cookie: 'session=tok-bob' }))).status, 400)
      assert.strictEqual((yield* call(post('inviteGuest', { workspaceId: 'acme', email: 'x@example.com', accessExpiresAt: T0 + 60 }, { cookie: 'session=tok-bob' }))).status, 400)
    })))

  it.effect('a permission denial is 403 with a user-safe reason; another workspace is 404', () =>
    run(Effect.gen(function* () {
      const denied = yield* call(post('inviteMember', { workspaceId: 'acme', email: 'x@example.com', role: 'member' }))
      assert.deepStrictEqual([denied.status, denied.body.error, denied.body.reason], [403, 'PermissionDenied', 'ROLE_LIMIT'])
      const hidden = yield* call(post('listMembers', { workspaceId: 'other' }))
      assert.deepStrictEqual([hidden.status, hidden.body.error], [404, 'WorkspaceUnavailable'])
    })))

  it.effect('invite then accept over HTTP; an expired invitation is 410', () =>
    run(Effect.gen(function* () {
      const invited = yield* call(post('inviteMember', { workspaceId: 'acme', email: 'new@example.com', role: 'commenter' }, { cookie: 'session=tok-bob', 'accept-language': 'de-DE,de;q=0.9' }))
      assert.strictEqual(invited.status, 200)
      const invitationId = (invited.body.data as { invitationId: string }).invitationId
      const accepted = yield* call(post('acceptInvitation', { invitationId }, { cookie: 'session=tok-new' }))
      assert.deepStrictEqual([accepted.status, accepted.body.data], [200, { workspaceId: 'acme', role: 'commenter' }])

      const again = yield* call(post('inviteMember', { workspaceId: 'acme', email: 'late@example.com', role: 'member' }, { cookie: 'session=tok-bob' }))
      yield* TestClock.adjust('8 days')
      const auth = yield* MemoryAuth
      yield* seedUser('late')
      yield* Ref.update(auth, (s) => ({ ...s, sessions: new Map(s.sessions).set('tok-late', session('late')) }))
      const expired = yield* call(post('acceptInvitation', { invitationId: (again.body.data as { invitationId: string }).invitationId }, { cookie: 'session=tok-late' }))
      assert.deepStrictEqual([expired.status, expired.body.error], [410, 'InvitationExpired'])
    })))

  it.effect('invitation acceptance is rate limited before the lookup', () =>
    run(Effect.gen(function* () {
      const statuses: Array<number> = []
      for (let i = 0; i < 11; i++) statuses.push((yield* call(post('acceptGuestInvitation', { token: `guess-token-${i}-xxxxxxxx` }))).status)
      assert.deepStrictEqual(statuses.slice(0, 10), Array.from({ length: 10 }, () => 404))
      assert.strictEqual(statuses[10], 429)
    })))

  it('exposes the planned operations', () => {
    assert.deepStrictEqual([...operationNames].sort(), [
      'acceptGuestInvitation', 'acceptInvitation', 'archiveProject', 'changeRole', 'createProject', 'createWorkspace', 'currentWorkspace',
      'grantFileAccess', 'grantProjectAccess', 'inviteGuest', 'inviteMember', 'listActivity', 'listMembers', 'listMyWorkspaces',
      'removeMember', 'revokeFileAccess', 'revokeGuestInvitation', 'revokeInvitation', 'revokeProjectAccess', 'setProjectAccessMode',
      'switchWorkspace', 'transferOwnership', 'updateProject',
    ])
  })
})
