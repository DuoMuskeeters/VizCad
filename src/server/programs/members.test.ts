import { assert, describe, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { EmailOutbox } from '../services/Email'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedMember, seedProject, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess } from './access'
import { acceptInvitation, changeRole, inviteMember, listMembers, removeMember, revokeInvitation, transferOwnership } from './members'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))

/** acme: owner bob, admin ada, member max, commenter cat. */
const acme = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'new', 'eve']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
})

const invite = (by: string, email: string, role: 'admin' | 'member' | 'commenter') =>
  inviteMember(caller(by), { workspaceId: 'acme', email, role, locale: 'tr' })

const roleOf = (userId: string) =>
  rows('member').pipe(Effect.map((all) => all.find((m) => m.organizationId === 'acme' && m.userId === userId)?.role ?? null))

describe('inviteMember', () => {
  it.effect('writes one pending invitation, an activity row, and sends one escaped email in the requested language', () =>
    run(Effect.gen(function* () {
      yield* acme
      const result = yield* invite('ada', '  New@Example.com ', 'member')
      assert.strictEqual(result.email, 'new@example.com')
      assert.strictEqual(result.expiresAt, T0 + 7 * 86400)
      const [row] = yield* rows('invitation')
      assert.deepStrictEqual([row?.status, row?.role, row?.inviterId], ['pending', 'member', 'ada'])
      const outbox = yield* Ref.get(yield* EmailOutbox)
      assert.strictEqual(outbox.length, 1)
      assert.strictEqual(outbox[0]?.to, 'new@example.com')
      assert.strictEqual(outbox[0]?.subject, "VizCad'de bir ekibe davet edildiniz")
      assert.include(outbox[0]?.text ?? '', `https://vizcad.test/invite/${result.invitationId}`)
      assert.include(outbox[0]?.html ?? '', 'ada@example.com')
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['member.invited'])
    })))

  it.effect('re-inviting resends from the same row with the new role', () =>
    run(Effect.gen(function* () {
      yield* acme
      const first = yield* invite('ada', 'new@example.com', 'member')
      yield* TestClock.adjust('1 hour')
      const second = yield* invite('ada', 'new@example.com', 'commenter')
      assert.strictEqual(second.invitationId, first.invitationId)
      assert.isTrue(second.resent)
      const all = yield* rows('invitation')
      assert.deepStrictEqual(all.map((i) => [i.role, i.status]), [['commenter', 'pending']])
      assert.strictEqual(all[0]?.expiresAt.getTime(), (T0 + 3600 + 7 * 86400) * 1000)
    })))

  it.effect('a resend racing a revoke never reopens the revoked invitation: no email without its activity row', () =>
    run(Effect.gen(function* () {
      yield* acme
      const first = yield* invite('ada', 'new@example.com', 'member')
      yield* Effect.all([
        Effect.result(invite('ada', 'new@example.com', 'commenter')),
        Effect.result(revokeInvitation(caller('bob'), { workspaceId: 'acme', invitationId: first.invitationId })),
      ], { concurrency: 'unbounded' })
      const log = (yield* rows('accessLog')).map((l) => l.action)
      const sent = (yield* Ref.get(yield* EmailOutbox)).length
      assert.strictEqual(sent, log.filter((a) => a === 'member.invited' || a === 'member.invite_resent').length)
      const original = (yield* rows('invitation')).find((i) => i.id === first.invitationId)
      if (original?.status === 'canceled') assert.notInclude(log, 'member.invite_resent')
    })))

  it.effect('an expired pending invitation is closed and a new one opened', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* invite('ada', 'new@example.com', 'member')
      yield* TestClock.adjust('8 days')
      const again = yield* invite('ada', 'new@example.com', 'member')
      assert.isFalse(again.resent)
      assert.deepStrictEqual((yield* rows('invitation')).map((i) => i.status).sort(), ['canceled', 'pending'])
    })))

  it.effect('role limits come from permissions.ts: admin cannot invite admins, member cannot invite', () =>
    run(Effect.gen(function* () {
      yield* acme
      const admin = yield* Effect.flip(invite('ada', 'x@example.com', 'admin'))
      assert.deepStrictEqual([admin._tag, admin._tag === 'PermissionDenied' ? admin.reason : ''], ['PermissionDenied', 'ROLE_LIMIT'])
      const member = yield* Effect.flip(invite('max', 'x@example.com', 'commenter'))
      assert.strictEqual(member._tag, 'PermissionDenied')
      assert.strictEqual((yield* invite('bob', 'x@example.com', 'admin')).role, 'admin')
    })))

  it.effect('refuses an existing internal member, an unverified inviter and a full workspace', () =>
    run(Effect.gen(function* () {
      yield* acme
      assert.strictEqual((yield* Effect.flip(invite('ada', 'max@example.com', 'member')))._tag, 'InvitationConflict')
      const unverified = yield* Effect.flip(inviteMember(caller('ada', { emailVerified: false }), { workspaceId: 'acme', email: 'y@example.com', role: 'member', locale: 'en' }))
      assert.strictEqual(unverified._tag, 'EmailUnverified')
      // 4 members + 1 pending = 5 seats
      yield* invite('ada', 'y@example.com', 'member')
      assert.strictEqual((yield* Effect.flip(invite('ada', 'z@example.com', 'member')))._tag, 'SeatLimitReached')
    }), { ...defaultPlan, seats: 5 }))

  it.effect('the daily invitation quota comes from Entitlements', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* invite('ada', 'a1@example.com', 'member')
      yield* invite('ada', 'a2@example.com', 'member')
      assert.strictEqual((yield* Effect.flip(invite('ada', 'a3@example.com', 'member')))._tag, 'RateLimitExceeded')
    }), { ...defaultPlan, invitesPerDay: 2 }))

  it.effect('the daily quota per user holds across workspaces (member and guest invitations share it)', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'bob')
      yield* inviteMember(caller('bob'), { workspaceId: 'beta', email: 'b1@example.com', role: 'member', locale: 'en' })
      yield* invite('bob', 'a1@example.com', 'member')
      const third = yield* Effect.flip(invite('bob', 'a2@example.com', 'member'))
      assert.strictEqual(third._tag, 'RateLimitExceeded')
      assert.strictEqual((yield* rows('invitation')).length, 2)
      // another user is unaffected
      assert.strictEqual((yield* invite('ada', 'a3@example.com', 'member')).role, 'member')
    }), { ...defaultPlan, invitesPerUserPerDay: 2 }))

  it.effect('a failed email keeps the invitation (resend from the row)', () =>
    run(Effect.gen(function* () {
      yield* acme
      const result = yield* invite('ada', 'someone@fail.test', 'member')
      assert.strictEqual(result.email, 'someone@fail.test')
      assert.strictEqual((yield* rows('invitation')).length, 1)
    })))

  it.effect('personal workspaces take no members', () =>
    run(Effect.gen(function* () {
      yield* seedUser('ada')
      yield* seedWorkspace('pers', 'ada', 'personal')
      const error = yield* Effect.flip(inviteMember(caller('ada'), { workspaceId: 'pers', email: 'x@example.com', role: 'member', locale: 'en' }))
      assert.strictEqual(error._tag, 'PermissionDenied')
    })))
})

describe('acceptInvitation', () => {
  it.effect('joins with the invited role, once; a second accept gives the same answer', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { invitationId } = yield* invite('ada', 'new@example.com', 'commenter')
      const first = yield* acceptInvitation(caller('new'), { invitationId })
      const second = yield* acceptInvitation(caller('new'), { invitationId })
      assert.deepStrictEqual(first, { workspaceId: 'acme', role: 'commenter' })
      assert.deepStrictEqual(second, first)
      assert.strictEqual(yield* roleOf('new'), 'commenter')
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['member.invited', 'member.joined'])
    })))

  it.effect('wrong account, unverified account, expiry instant and canceled invitations', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { invitationId } = yield* invite('ada', 'new@example.com', 'member')
      assert.strictEqual((yield* Effect.flip(acceptInvitation(caller('eve'), { invitationId })))._tag, 'InvitationUnavailable')
      assert.strictEqual((yield* Effect.flip(acceptInvitation(caller('new', { emailVerified: false }), { invitationId })))._tag, 'EmailUnverified')
      yield* TestClock.adjust('604799 seconds')
      yield* TestClock.adjust('1 second') // now === expiresAt
      assert.strictEqual((yield* Effect.flip(acceptInvitation(caller('new'), { invitationId })))._tag, 'InvitationExpired')
      const fresh = yield* invite('ada', 'new@example.com', 'member')
      yield* revokeInvitation(caller('bob'), { workspaceId: 'acme', invitationId: fresh.invitationId })
      assert.strictEqual((yield* Effect.flip(acceptInvitation(caller('new'), { invitationId: fresh.invitationId })))._tag, 'InvitationUnavailable')
      assert.strictEqual(yield* roleOf('new'), null)
    })))

  it.effect("the inviter's current right is re-checked: a demoted inviter's invitation no longer works", () =>
    run(Effect.gen(function* () {
      yield* acme
      const { invitationId } = yield* invite('ada', 'new@example.com', 'member')
      yield* changeRole(caller('bob'), { workspaceId: 'acme', userId: 'ada', role: 'member' })
      assert.strictEqual((yield* Effect.flip(acceptInvitation(caller('new'), { invitationId })))._tag, 'InvitationUnavailable')
    })))

  it.effect('a guest is upgraded in place and keeps their grants', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'new', 'guest')
      yield* seedFile('f1', 'bob', 'acme')
      yield* grantFileAccess(caller('bob'), { workspaceId: 'acme', fileId: 'f1', userId: 'new', level: 'download', expiresAt: T0 + 86400 })
      const { invitationId } = yield* invite('ada', 'new@example.com', 'member')
      yield* acceptInvitation(caller('new'), { invitationId })
      assert.strictEqual(yield* roleOf('new'), 'member')
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.userId, g.level]), [['new', 'download']])
    })))

  it.effect('the last seat is re-checked at acceptance', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { invitationId } = yield* invite('ada', 'new@example.com', 'member')
      // A guest promotion takes the seat the pending invitation was counted against.
      yield* seedMember('acme', 'eve', 'guest')
      const error = yield* Effect.flip(changeRole(caller('bob'), { workspaceId: 'acme', userId: 'eve', role: 'member' }))
      assert.strictEqual(error._tag, 'SeatLimitReached')
      assert.deepStrictEqual(yield* acceptInvitation(caller('new'), { invitationId }), { workspaceId: 'acme', role: 'member' })
    }), { ...defaultPlan, seats: 5 }))
})

describe('revokeInvitation', () => {
  it.effect("another workspace's invitation is unavailable; repeating a cancel is harmless", () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'eve')
      const { invitationId } = yield* invite('ada', 'new@example.com', 'member')
      assert.strictEqual((yield* Effect.flip(revokeInvitation(caller('eve'), { workspaceId: 'beta', invitationId })))._tag, 'InvitationUnavailable')
      assert.deepStrictEqual(yield* revokeInvitation(caller('ada'), { workspaceId: 'acme', invitationId }), { canceled: true })
      assert.deepStrictEqual(yield* revokeInvitation(caller('ada'), { workspaceId: 'acme', invitationId }), { canceled: true })
      assert.deepStrictEqual((yield* rows('invitation')).map((i) => i.status), ['canceled'])
    })))
})

describe('changeRole', () => {
  it.effect('owner manages admins; admin manages member/commenter only; owner is never a target', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* changeRole(caller('bob'), { workspaceId: 'acme', userId: 'max', role: 'admin' })
      assert.strictEqual(yield* roleOf('max'), 'admin')
      const adminOnAdmin = yield* Effect.flip(changeRole(caller('ada'), { workspaceId: 'acme', userId: 'max', role: 'member' }))
      assert.strictEqual(adminOnAdmin._tag, 'PermissionDenied')
      yield* changeRole(caller('ada'), { workspaceId: 'acme', userId: 'cat', role: 'member' })
      assert.strictEqual(yield* roleOf('cat'), 'member')
      assert.strictEqual((yield* Effect.flip(changeRole(caller('ada'), { workspaceId: 'acme', userId: 'bob', role: 'member' })))._tag, 'LastOwner')
      assert.strictEqual((yield* Effect.flip(changeRole(caller('bob'), { workspaceId: 'acme', userId: 'nobody', role: 'member' })))._tag, 'MemberUnavailable')
    })))

  it.effect('a guest is promoted to member, never straight to admin', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      assert.strictEqual((yield* Effect.flip(changeRole(caller('bob'), { workspaceId: 'acme', userId: 'eve', role: 'admin' })))._tag, 'PermissionDenied')
      yield* changeRole(caller('bob'), { workspaceId: 'acme', userId: 'eve', role: 'member' })
      assert.strictEqual(yield* roleOf('eve'), 'member')
    })))

  it.effect('demoting a creator-manager to commenter clears the manager mark', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedProject('p1', 'acme', 'max', 'restricted', 'max')
      yield* changeRole(caller('ada'), { workspaceId: 'acme', userId: 'max', role: 'commenter' })
      assert.strictEqual((yield* rows('projects'))[0]?.creatorManagerUserId, null)
    })))
})

describe('removeMember', () => {
  it.effect('the actor is judged before the target is looked up: a non-manager gets 403 whether or not the user exists', () =>
    run(Effect.gen(function* () {
      yield* acme
      for (const who of ['max', 'cat']) {
        const real = yield* Effect.flip(removeMember(caller(who), { workspaceId: 'acme', userId: 'ada' }))
        const ghost = yield* Effect.flip(removeMember(caller(who), { workspaceId: 'acme', userId: 'nobody' }))
        assert.deepStrictEqual([real._tag, ghost._tag], ['PermissionDenied', 'PermissionDenied'])
        const ghostRole = yield* Effect.flip(changeRole(caller(who), { workspaceId: 'acme', userId: 'nobody', role: 'member' }))
        assert.strictEqual(ghostRole._tag, 'PermissionDenied')
      }
      assert.strictEqual((yield* Effect.flip(removeMember(caller('ada'), { workspaceId: 'acme', userId: 'nobody' })))._tag, 'MemberUnavailable')
    })))

  it.effect('removes membership and grants, revokes their links, closes their invitations, resets their sessions', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedFile('f1', 'max', 'acme')
      yield* seedProject('p1', 'acme', 'max', 'restricted', 'max')
      yield* grantFileAccess(caller('bob'), { workspaceId: 'acme', fileId: 'f1', userId: 'max', level: 'edit', expiresAt: null })
      const db = yield* Db
      yield* db.use((d) => d.batch([
        d.insert(schema.shareLinks).values({ id: 'l1', workspaceId: 'acme', fileId: 'f1', createdByUserId: 'max', tokenDigest: 'dg', tokenCiphertext: 'ct', tokenKeyVersion: 1, level: 'view', revision: 1, createdAt: new Date(T0 * 1000), updatedAt: new Date(T0 * 1000) }),
        d.insert(schema.invitation).values({ id: 'i1', organizationId: 'acme', email: 'q@example.com', role: 'member', status: 'pending', expiresAt: new Date((T0 + 100) * 1000), createdAt: new Date(T0 * 1000), inviterId: 'max' }),
        d.insert(schema.session).values({ id: 's1', token: 't1', userId: 'max', expiresAt: new Date((T0 + 100) * 1000), createdAt: new Date(T0 * 1000), updatedAt: new Date(T0 * 1000), activeOrganizationId: 'acme' }),
      ]))
      yield* removeMember(caller('ada'), { workspaceId: 'acme', userId: 'max' })
      assert.strictEqual(yield* roleOf('max'), null)
      assert.strictEqual((yield* rows('fileAccess')).length, 0)
      assert.strictEqual((yield* rows('projects'))[0]?.creatorManagerUserId, null)
      const [link] = yield* rows('shareLinks')
      assert.deepStrictEqual([link?.revokedAt?.getTime(), link?.revision], [T0 * 1000, 2])
      assert.deepStrictEqual((yield* rows('invitation')).map((i) => i.status), ['canceled'])
      const [session] = yield* db.use((d) => d.select().from(schema.session))
      assert.strictEqual(session?.activeOrganizationId, null)
    })))

  it.effect('cannot remove the owner; members cannot remove anyone', () =>
    run(Effect.gen(function* () {
      yield* acme
      assert.strictEqual((yield* Effect.flip(removeMember(caller('ada'), { workspaceId: 'acme', userId: 'bob' })))._tag, 'LastOwner')
      assert.strictEqual((yield* Effect.flip(removeMember(caller('max'), { workspaceId: 'acme', userId: 'cat' })))._tag, 'PermissionDenied')
    })))

  it.effect('a removed member who rejoins gets no old grants back', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedFile('f1', 'bob', 'acme')
      yield* grantFileAccess(caller('bob'), { workspaceId: 'acme', fileId: 'f1', userId: 'cat', level: 'comment', expiresAt: null })
      yield* removeMember(caller('bob'), { workspaceId: 'acme', userId: 'cat' })
      const { invitationId } = yield* invite('bob', 'cat@example.com', 'commenter')
      yield* acceptInvitation(caller('cat'), { invitationId })
      assert.strictEqual((yield* rows('fileAccess')).length, 0)
    })))
})

describe('transferOwnership', () => {
  it.effect('owner becomes admin and the target owner, exactly one owner', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* transferOwnership(caller('bob'), { workspaceId: 'acme', userId: 'max' })
      assert.deepStrictEqual([yield* roleOf('bob'), yield* roleOf('max')], ['admin', 'owner'])
      assert.strictEqual((yield* rows('member')).filter((m) => m.role === 'owner').length, 1)
      // The previous owner lost the right; a repeat by them is denied.
      assert.strictEqual((yield* Effect.flip(transferOwnership(caller('bob'), { workspaceId: 'acme', userId: 'ada' })))._tag, 'PermissionDenied')
    })))

  it.effect('refuses commenters, guests, admins acting, and personal workspaces', () =>
    run(Effect.gen(function* () {
      yield* acme
      assert.strictEqual((yield* Effect.flip(transferOwnership(caller('bob'), { workspaceId: 'acme', userId: 'cat' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* Effect.flip(transferOwnership(caller('ada'), { workspaceId: 'acme', userId: 'max' })))._tag, 'PermissionDenied')
      yield* seedWorkspace('pers', 'eve', 'personal')
      yield* seedMember('pers', 'max', 'guest')
      assert.strictEqual((yield* Effect.flip(transferOwnership(caller('eve'), { workspaceId: 'pers', userId: 'max' })))._tag, 'PermissionDenied')
    })))

  it.effect('a concurrent second transfer rolls back entirely (guard), leaving one owner', () =>
    run(Effect.gen(function* () {
      yield* acme
      const results = yield* Effect.all([
        transferOwnership(caller('bob'), { workspaceId: 'acme', userId: 'max' }).pipe(Effect.result),
        transferOwnership(caller('bob'), { workspaceId: 'acme', userId: 'ada' }).pipe(Effect.result),
      ], { concurrency: 2 })
      assert.strictEqual(results.filter((r) => r._tag === 'Success').length, 1)
      assert.strictEqual((yield* rows('member')).filter((m) => m.role === 'owner').length, 1)
    })))
})

describe('listMembers', () => {
  it.effect('internal members see everyone; managers also see pending invitations', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      yield* invite('ada', 'new@example.com', 'member')
      const asMember = yield* listMembers(caller('max'), { workspaceId: 'acme' })
      assert.deepStrictEqual(asMember.members.map((m) => m.userId).sort(), ['ada', 'bob', 'cat', 'eve', 'max'])
      assert.strictEqual(asMember.invitations.length, 0)
      const asAdmin = yield* listMembers(caller('ada'), { workspaceId: 'acme' })
      assert.deepStrictEqual(asAdmin.invitations.map((i) => i.email), ['new@example.com'])
    })))

  it.effect('a guest with a live grant sees only themself, not the internal team or other guests', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      yield* seedMember('acme', 'new', 'guest')
      const view = yield* listMembers(caller('eve'), { workspaceId: 'acme' })
      assert.deepStrictEqual(view.members.map((m) => m.userId), ['eve'])
      assert.strictEqual(view.invitations.length, 0)
    })))

  it.effect('a guest whose grants have ended sees only themself', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      yield* seedMember('acme', 'new', 'guest')
      yield* TestClock.adjust('400 days')
      const view = yield* listMembers(caller('eve'), { workspaceId: 'acme' })
      assert.deepStrictEqual(view.members.map((m) => m.userId), ['eve'])
    })))

  it.effect('a commenter sees the team and the guests', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      const view = yield* listMembers(caller('cat'), { workspaceId: 'acme' })
      assert.deepStrictEqual(view.members.map((m) => m.userId).sort(), ['ada', 'bob', 'cat', 'eve', 'max'])
      assert.strictEqual(view.invitations.length, 0)
    })))
})
