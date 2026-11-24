import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { MemoryAuth, type SessionSummary } from '../services/Auth'
import { defaultPlan } from '../services/Entitlements'
import { programLayer, rows, seedFile, seedMember, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
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
  sessionId: `s-${userId}`, userId, name: userId, email: `${userId}@example.com`, emailVerified: true, accountStatus: 'active', activeWorkspaceId: null, ...overrides,
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

  it.effect('timestamps and the activity cursor are bounded: beyond year 2100 is 400', () =>
    run(Effect.gen(function* () {
      const bob = { cookie: 'session=tok-bob' }
      const huge = 4102444801
      assert.strictEqual((yield* call(post('inviteGuest', { workspaceId: 'acme', fileId: 'f', email: 'x@example.com', accessExpiresAt: huge }, bob))).status, 400)
      assert.strictEqual((yield* call(post('grantFileAccess', { workspaceId: 'acme', fileId: 'f', userId: 'ada', level: 'view', expiresAt: huge }, bob))).status, 400)
      assert.strictEqual((yield* call(post('listActivity', { workspaceId: 'acme', cursor: `${huge}.abc` }, bob))).status, 400)
      assert.strictEqual((yield* call(post('listActivity', { workspaceId: 'acme', cursor: `${T0}.abc` }, bob))).status, 200)
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

  it.effect('getInvitation: needs exactly one reference, answers 200 with the bare other_account state, and is rate limited', () =>
    run(Effect.gen(function* () {
      assert.strictEqual((yield* call(post('getInvitation', {}))).status, 400)
      assert.strictEqual((yield* call(post('getInvitation', { invitationId: 'a', token: 'b'.repeat(20) }))).status, 400)
      const unknown = yield* call(post('getInvitation', { invitationId: 'nope' }))
      assert.deepStrictEqual([unknown.status, unknown.body.data], [200, { state: 'other_account' }])
      const statuses: Array<number> = []
      for (let i = 0; i < 125; i++) statuses.push((yield* call(post('getInvitation', { invitationId: `x${i}` }, { 'cf-connecting-ip': '198.51.100.9' }))).status)
      assert.isTrue(statuses.includes(429))
    })))

  it.effect('currentWorkspace tells a new sign-up it needs onboarding; completeOnboarding clears it', () =>
    run(Effect.gen(function* () {
      const first = yield* call(post('currentWorkspace', {}, { cookie: 'session=tok-new' }))
      assert.strictEqual((first.body.data as { needsOnboarding: boolean }).needsOnboarding, true)
      assert.strictEqual((yield* call(post('completeOnboarding', {}, { cookie: 'session=tok-new' }))).status, 200)
      const after = yield* call(post('currentWorkspace', {}, { cookie: 'session=tok-new' }))
      assert.strictEqual((after.body.data as { needsOnboarding: boolean }).needsOnboarding, false)
    })))

  it.effect('requestUpload: validates the body, signs a key the server picks, and reads no client key, MIME or etag', () =>
    run(Effect.gen(function* () {
      const bob = { cookie: 'session=tok-bob' }
      const body = { workspaceId: 'acme', name: 'Bracket v2.step', size: 5_000_000 }
      const ok = yield* call(post('requestUpload', body, bob))
      assert.strictEqual(ok.status, 200)
      const ticket = ok.body.data as { uploadId: string; url: string; headers: Record<string, string>; expiresAt: number }
      assert.deepStrictEqual(ticket.headers, { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' })
      assert.strictEqual(ticket.expiresAt, T0 + 600)
      const url = new URL(ticket.url)
      assert.match(decodeURIComponent(url.pathname), /^\/w\/acme\/f\/[0-9A-Z]{26}\/[0-9A-Z]{26}$/)
      assert.notInclude(ticket.url, 'Bracket')
      assert.strictEqual(ok.headers.get('cache-control'), 'private, no-store')

      for (const extra of [{ key: 'u/other/key' }, { r2Key: 'x' }, { mimeType: 'text/html' }, { contentType: 'text/html' }, { fileId: 'f1' }]) {
        assert.strictEqual((yield* call(post('requestUpload', { ...body, ...extra }, bob))).status, 400, JSON.stringify(extra))
      }
      for (const bad of [{ size: 0 }, { size: -1 }, { size: 1.5 }, { size: '10' }, { name: '' }, { name: 'a/b.stl' }, { name: 'x'.repeat(256) + '.stl' }]) {
        assert.strictEqual((yield* call(post('requestUpload', { ...body, ...bad }, bob))).status, 400, JSON.stringify(bad))
      }
      const dwg = yield* call(post('requestUpload', { ...body, name: 'plan.dwg' }, bob))
      assert.deepStrictEqual([dwg.status, dwg.body.error], [415, 'UnsupportedFileType'])
      const big = yield* call(post('requestUpload', { ...body, size: 101 * 1024 * 1024 }, bob))
      assert.deepStrictEqual([big.status, big.body.error], [413, 'FileTooLarge'])
      assert.strictEqual((yield* call(post('requestUpload', { ...body, projectId: 'p', targetFileId: 'f' }, bob))).status, 400)
      assert.strictEqual((yield* call(post('requestUpload', body, { cookie: 'session=nobody' }))).status, 401)
      assert.strictEqual((yield* call(post('requestUpload', body, bob, 'GET'))).status, 403)
      assert.strictEqual((yield* call(post('requestUpload', body, { ...bob, origin: 'https://evil.test' }))).status, 403)
    })))

  it.effect('requestUpload is rate limited; completeUpload and cancelUpload answer 404 for an unknown session', () =>
    run(Effect.gen(function* () {
      const bob = { cookie: 'session=tok-bob', 'cf-connecting-ip': '198.51.100.20' }
      assert.deepStrictEqual((yield* call(post('completeUpload', { uploadId: 'nope', etag: 'x' }, bob))).body.error, 'UploadUnavailable')
      assert.deepStrictEqual((yield* call(post('cancelUpload', { uploadId: 'nope' }, bob))).status, 404)
      // Eleven calls over the open-session limit would hit UploadLimitReached first; use a tiny file to stay below it and check the counter.
      const statuses: Array<number> = []
      for (let i = 0; i < 241; i++) statuses.push((yield* call(post('requestUpload', { workspaceId: 'other', name: 'a.stl', size: 100 }, bob))).status)
      assert.strictEqual(statuses[240], 429)
    })))

  it.effect('file operations: list, detail, rename, trash, purge answer as the programs do; bad bodies are 400', () =>
    run(Effect.gen(function* () {
      yield* seedFile('f1', 'bob', 'acme')
      yield* seedUploaderGrant('f1', 'ada', 'acme')
      const bob = { cookie: 'session=tok-bob' }
      const list = yield* call(post('listFiles', { workspaceId: 'acme' }))
      assert.strictEqual(list.status, 200)
      assert.deepStrictEqual((list.body.data as { items: Array<{ name: string }>; nextCursor: null }).items.map((i) => i.name), ['f1.step'])
      assert.strictEqual((yield* call(post('listFiles', { workspaceId: 'acme', sort: 'weight' }))).status, 400)
      assert.strictEqual((yield* call(post('listFiles', { workspaceId: 'acme', limit: 101 }))).status, 400)
      assert.strictEqual((yield* call(post('getFile', { workspaceId: 'acme', fileId: 'f1', r2Key: 'x' }))).status, 400)
      assert.strictEqual((yield* call(post('getFile', { workspaceId: 'acme', fileId: 'missing' }))).status, 404)
      const renamed = yield* call(post('renameFile', { workspaceId: 'acme', fileId: 'f1', name: 'Bracket' }))
      assert.deepStrictEqual([renamed.status, renamed.body.data], [200, { fileId: 'f1', name: 'Bracket.step' }])
      assert.strictEqual((yield* call(post('trashFile', { workspaceId: 'acme', fileId: 'f1' }))).status, 200)
      const denied = yield* call(post('purgeFile', { workspaceId: 'acme', fileId: 'f1' }))
      assert.deepStrictEqual([denied.status, denied.body.error, denied.body.reason], [403, 'PermissionDenied', 'ROLE_LIMIT'])
      assert.strictEqual((yield* call(post('purgeFile', { workspaceId: 'acme', fileId: 'f1' }, bob))).status, 200)
      assert.strictEqual((yield* call(post('restoreVersion', { workspaceId: 'acme', fileId: 'f1', versionId: 'v' }, bob))).status, 404)
      const trash = yield* call(post('listTrash', { workspaceId: 'acme' }, bob))
      assert.deepStrictEqual([trash.status, trash.body.data], [200, { items: [], nextCursor: null }])
    })))

  it('exposes the planned operations', () => {
    assert.deepStrictEqual([...operationNames].sort(), [
      'acceptGuestInvitation', 'acceptInvitation', 'archiveProject', 'cancelUpload', 'changeRole', 'completeOnboarding', 'completeUpload', 'createProject', 'createWorkspace', 'currentWorkspace',
      'emptyTrash', 'getFile', 'getInvitation', 'grantFileAccess', 'grantProjectAccess', 'inviteGuest', 'inviteMember', 'listActivity', 'listFiles', 'listMembers', 'listMyWorkspaces', 'listTrash', 'listVersions',
      'moveFile', 'previewMemberRemoval', 'previewMoveFile', 'purgeFile', 'removeMember', 'renameFile', 'requestUpload', 'restoreFile', 'restoreVersion', 'revokeFileAccess', 'revokeGuestInvitation', 'revokeInvitation',
      'revokeProjectAccess', 'setProjectAccessMode', 'starFile', 'switchWorkspace', 'transferOwnership', 'trashFile', 'unstarFile', 'updateProject',
    ])
  })
})
