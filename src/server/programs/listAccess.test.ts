import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, seedFile, seedMember, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess, grantProjectAccess, listFileAccess, listProjectAccess } from './access'
import { inviteGuest } from './guests'
import { createProject } from './projects'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const acme = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedFile('f1', 'max', 'acme')
  yield* seedUploaderGrant('f1', 'max', 'acme')
})

describe('listFileAccess', () => {
  it.effect('a manager sees the uploader, grants (with expiry and source) and pending guest invitations', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* grantFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1', userId: 'cat', level: 'comment', expiresAt: T0 + 7200 })
      yield* grantFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + 3600 })
      yield* inviteGuest(caller('max'), { workspaceId: 'acme', target: { fileId: 'f1' }, email: 'new@guest.test', level: 'view', accessExpiresAt: T0 + 3600, locale: 'en' })
      const list = yield* listFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      assert.isTrue(list.canManage)
      assert.deepStrictEqual(
        list.people.map((p) => [p.userId, p.role, p.level, p.source, p.expiresAt, p.canRevoke, p.self]),
        [
          ['max', 'member', 'edit', 'uploader', null, false, true],
          // A member may take back a guest's access he gave, but not a colleague's (permissions.ts revokeFileAccess).
          ['cat', 'commenter', 'comment', 'grant', T0 + 7200, false, false],
          ['eve', 'guest', 'view', 'grant', T0 + 3600, true, false],
        ],
      )
      assert.deepStrictEqual(list.invitations.map((i) => [i.email, i.level, i.accessExpiresAt]), [['new@guest.test', 'view', T0 + 3600]])
      assert.deepStrictEqual(Object.keys(list.people[1] ?? {}).sort(), ['canRevoke', 'email', 'expired', 'expiresAt', 'grantedBy', 'level', 'name', 'role', 'self', 'source', 'userId'])
    })))

  it.effect('a guest sees only themself (D20); a commenter without the right to share sees no other person', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* grantFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + 3600 })
      yield* grantFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1', userId: 'cat', level: 'view', expiresAt: null })
      const guest = yield* listFileAccess(caller('eve'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual([guest.canManage, guest.people.map((p) => [p.userId, p.self, p.canRevoke]), guest.invitations], [false, [['eve', true, false]], []])
      const commenter = yield* listFileAccess(caller('cat'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual([commenter.canManage, commenter.people.map((p) => p.userId), commenter.invitations], [false, ['cat'], []])
      assert.isTrue((yield* listFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1' })).canManage)
    })))

  it.effect('flags an expired grant, and refuses people without view or from another workspace', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedUser('out')
      yield* seedWorkspace('beta', 'out')
      yield* grantFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + 60 })
      yield* TestClock.setTime((T0 + 120) * 1000)
      const list = yield* listFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual(list.people.filter((p) => p.userId === 'eve').map((p) => p.expired), [true])
      assert.strictEqual((yield* Effect.flip(listFileAccess(caller('eve'), { workspaceId: 'acme', fileId: 'f1' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* Effect.flip(listFileAccess(caller('out'), { workspaceId: 'acme', fileId: 'f1' })))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* Effect.flip(listFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'missing' })))._tag, 'ResourceUnavailable')
    })))

  it.effect('in a restricted project only its manager lists people', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* createProject(caller('ada'), { workspaceId: 'acme', name: 'Closed', description: null, accessMode: 'restricted' })
      yield* seedFile('f2', 'ada', 'acme', p.id)
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: p.id, userId: 'max', level: 'edit', expiresAt: null })
      const member = yield* listFileAccess(caller('max'), { workspaceId: 'acme', fileId: 'f2' })
      assert.deepStrictEqual([member.canManage, member.people], [false, []])
      assert.isTrue((yield* listFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f2' })).canManage)
      assert.strictEqual((yield* Effect.flip(listFileAccess(caller('cat'), { workspaceId: 'acme', fileId: 'f2' })))._tag, 'PermissionDenied')
    })))
})

describe('listProjectAccess', () => {
  it.effect('lists project grants and pending invitations for the manager; others see only their own row', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* createProject(caller('ada'), { workspaceId: 'acme', name: 'Closed', description: null, accessMode: 'restricted' })
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: p.id, userId: 'max', level: 'edit', expiresAt: null })
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: p.id, userId: 'eve', level: 'comment', expiresAt: T0 + 3600 })
      yield* inviteGuest(caller('ada'), { workspaceId: 'acme', target: { projectId: p.id }, email: 'x@guest.test', level: 'comment', accessExpiresAt: T0 + 3600, locale: 'en' })
      const list = yield* listProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: p.id })
      assert.deepStrictEqual(list.people.map((x) => [x.userId, x.level, x.canRevoke]).sort(), [['eve', 'comment', true], ['max', 'edit', true]])
      assert.deepStrictEqual(list.invitations.map((i) => i.email), ['x@guest.test'])
      const guest = yield* listProjectAccess(caller('eve'), { workspaceId: 'acme', projectId: p.id })
      assert.deepStrictEqual([guest.canManage, guest.people.map((x) => x.userId), guest.invitations], [false, ['eve'], []])
      assert.strictEqual((yield* Effect.flip(listProjectAccess(caller('cat'), { workspaceId: 'acme', projectId: p.id })))._tag, 'PermissionDenied')
    })))
})
