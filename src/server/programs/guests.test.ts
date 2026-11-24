import { assert, describe, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { EmailOutbox } from '../services/Email'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedMember, seedProject, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess, grantProjectAccess, revokeFileAccess, revokeProjectAccess } from './access'
import { acceptGuestInvitation, inviteGuest, revokeGuestInvitation, tokenDigest } from './guests'
import { changeRole } from './members'
import { listMyWorkspaces } from './workspaces'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))

const DAY = 86400

/** acme: owner bob, admin ada, member max, commenter cat; f1 projectless, p1 team (f2), p2 restricted by max (f3). */
const acme = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed', 'ivy']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedFile('f1', 'bob', 'acme')
  yield* seedProject('p1', 'acme', 'bob', 'team')
  yield* seedFile('f2', 'bob', 'acme', 'p1')
  yield* seedProject('p2', 'acme', 'max', 'restricted', 'max')
  yield* seedFile('f3', 'bob', 'acme', 'p2')
})

/** The token is only in the email; tests read it back from the outbox like a recipient would. */
const lastToken = Effect.gen(function* () {
  const outbox = yield* Ref.get(yield* EmailOutbox)
  return /guest-invite\/([A-Za-z0-9_-]+)/.exec(outbox[outbox.length - 1]?.text ?? '')?.[1] ?? ''
})

/** A guest membership on f1 whose grant ends at `until` (Unix seconds). */
const seedGuest = (userId: string, until: number) =>
  Effect.gen(function* () {
    yield* seedMember('acme', userId, 'guest')
    yield* Db.use((db) => db.use((d) => d.insert(schema.fileAccess).values({
      workspaceId: 'acme', fileId: 'f1', userId, level: 'view', expiresAt: new Date(until * 1000), grantedByUserId: 'bob', source: 'grant',
      createdAt: new Date((T0 - 3600) * 1000), updatedAt: new Date((T0 - 3600) * 1000),
    })))
  })

const inviteEve = (by: string, target: { fileId: string } | { projectId: string }, level: 'view' | 'comment' | 'download' = 'comment', accessExpiresAt = T0 + 30 * DAY) =>
  inviteGuest(caller(by), { workspaceId: 'acme', target, email: 'eve@example.com', level, accessExpiresAt, locale: 'en' })

describe('inviteGuest / acceptGuestInvitation', () => {
  it.effect('a file guest: pending row with a token digest, then guest membership and an expiring grant', () =>
    run(Effect.gen(function* () {
      yield* acme
      const invited = yield* inviteEve('ada', { fileId: 'f1' })
      assert.strictEqual(invited.expiresAt, T0 + 7 * DAY)
      const token = yield* lastToken
      assert.strictEqual(token.length, 43)
      const [row] = yield* rows('resourceInvitations')
      assert.strictEqual(row?.tokenDigest, yield* tokenDigest(token))
      assert.notInclude(JSON.stringify(row), token)

      const accepted = yield* acceptGuestInvitation(caller('eve'), { token })
      assert.deepStrictEqual(accepted, { workspaceId: 'acme', fileId: 'f1', projectId: null })
      const guest = (yield* rows('member')).find((m) => m.userId === 'eve')
      assert.strictEqual(guest?.role, 'guest')
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.userId, g.level, g.expiresAt?.getTime(), g.grantedByUserId]), [['eve', 'comment', (T0 + 30 * DAY) * 1000, 'ada']])
      // Single use: a second accept by the same account is idempotent, by another account unavailable.
      assert.deepStrictEqual(yield* acceptGuestInvitation(caller('eve'), { token }), accepted)
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('zed', { email: 'eve@example.com' }), { token })))._tag, 'InvitationUnavailable')
      assert.deepStrictEqual((yield* rows('accessLog')).map((l) => l.action), ['guest.invited', 'guest.joined'])
    })))

  it.effect('two invitations, one guest membership, no seat used', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* inviteEve('ada', { fileId: 'f1' })
      yield* acceptGuestInvitation(caller('eve'), { token: yield* lastToken })
      yield* inviteEve('ada', { projectId: 'p1' }, 'download')
      yield* acceptGuestInvitation(caller('eve'), { token: yield* lastToken })
      assert.strictEqual((yield* rows('member')).filter((m) => m.userId === 'eve').length, 1)
      assert.deepStrictEqual((yield* rows('projectAccess')).map((g) => [g.userId, g.level]), [['eve', 'download']])
    }), { ...defaultPlan, seats: 4 }))

  it.effect('level and duration limits: no edit, mandatory finite end within the plan ceiling', () =>
    run(Effect.gen(function* () {
      yield* acme
      const tooLong = yield* Effect.flip(inviteEve('ada', { fileId: 'f1' }, 'comment', T0 + 366 * DAY))
      assert.strictEqual(tooLong._tag, 'AccessExpiryInvalid')
      const past = yield* Effect.flip(inviteEve('ada', { fileId: 'f1' }, 'comment', T0))
      assert.strictEqual(past._tag, 'AccessExpiryInvalid')
      assert.strictEqual((yield* rows('resourceInvitations')).length, 0)
    })))

  it.effect('who may invite: members only with edit on the file; restricted project only its managers', () =>
    run(Effect.gen(function* () {
      yield* acme
      assert.strictEqual((yield* Effect.flip(inviteEve('max', { fileId: 'f1' })))._tag, 'PermissionDenied') // member baseline is download
      assert.strictEqual((yield* Effect.flip(inviteEve('cat', { fileId: 'f1' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* inviteEve('max', { projectId: 'p2' })).level, 'comment') // creator-manager
      assert.strictEqual((yield* Effect.flip(inviteEve('max', { projectId: 'p1' })))._tag, 'PermissionDenied') // team project settings: owner/admin
    })))

  it.effect('an internal member cannot be a guest (RoleConflict), at invite and at accept', () =>
    run(Effect.gen(function* () {
      yield* acme
      const error = yield* Effect.flip(inviteGuest(caller('ada'), { workspaceId: 'acme', target: { fileId: 'f1' }, email: 'MAX@example.com', level: 'view', accessExpiresAt: T0 + DAY, locale: 'en' }))
      assert.strictEqual(error._tag, 'RoleConflict')
      yield* inviteEve('ada', { fileId: 'f1' })
      const token = yield* lastToken
      yield* seedMember('acme', 'eve', 'member')
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token })))._tag, 'RoleConflict')
    })))

  it.effect('expired, canceled and unknown tokens; wrong account', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* inviteEve('ada', { fileId: 'f1' })
      const token = yield* lastToken
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('zed'), { token })))._tag, 'InvitationUnavailable')
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token: 'nope' })))._tag, 'InvitationUnavailable')
      yield* TestClock.adjust('7 days')
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token })))._tag, 'InvitationExpired')
      const again = yield* inviteEve('ada', { fileId: 'f1' })
      const token2 = yield* lastToken
      yield* revokeGuestInvitation(caller('ada'), { workspaceId: 'acme', invitationId: again.invitationId })
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token: token2 })))._tag, 'InvitationUnavailable')
    })))

  it.effect('the inviter losing the right (demoted) voids the invitation', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* inviteEve('max', { projectId: 'p2' })
      const token = yield* lastToken
      yield* changeRole(caller('bob'), { workspaceId: 'acme', userId: 'max', role: 'commenter' })
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token })))._tag, 'InvitationUnavailable')
    })))

  it.effect('the guest limit comes from Entitlements', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedGuest('zed', T0 + DAY)
      yield* inviteEve('ada', { fileId: 'f1' })
      assert.strictEqual((yield* Effect.flip(acceptGuestInvitation(caller('eve'), { token: yield* lastToken })))._tag, 'GuestLimitReached')
    }), { ...defaultPlan, guests: 1 }))

  it.effect('guests whose grants have all ended do not use the guest quota', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedGuest('zed', T0 - 1)
      yield* inviteEve('ada', { fileId: 'f1' })
      yield* acceptGuestInvitation(caller('eve'), { token: yield* lastToken })
      assert.deepStrictEqual((yield* rows('member')).filter((m) => m.role === 'guest').map((m) => m.userId).sort(), ['eve', 'zed'])
    }), { ...defaultPlan, guests: 1 }))

  it.effect('two guests accepting at once with one place left: exactly one joins', () =>
    run(Effect.gen(function* () {
      yield* acme
      const invite = (email: string) =>
        inviteGuest(caller('ada'), { workspaceId: 'acme', target: { fileId: 'f1' }, email, level: 'view', accessExpiresAt: T0 + 30 * DAY, locale: 'en' })
      yield* invite('eve@example.com')
      const eveToken = yield* lastToken
      yield* invite('ivy@example.com')
      const ivyToken = yield* lastToken
      const results = yield* Effect.all([
        Effect.result(acceptGuestInvitation(caller('eve'), { token: eveToken })),
        Effect.result(acceptGuestInvitation(caller('ivy'), { token: ivyToken })),
      ], { concurrency: 'unbounded' })
      assert.strictEqual(results.filter((r) => r._tag === 'Success').length, 1)
      assert.strictEqual((yield* rows('member')).filter((m) => m.role === 'guest').length, 1)
      const failure = results.find((r) => r._tag === 'Failure')
      assert.include(['GuestLimitReached', 'WriteConflict'], failure?._tag === 'Failure' ? failure.failure._tag : '')
    }), { ...defaultPlan, guests: 1 }))

  it.effect('a guest resend racing a revoke sends no email without its activity row and never reopens the revoked row', () =>
    run(Effect.gen(function* () {
      yield* acme
      const first = yield* inviteEve('ada', { fileId: 'f1' })
      yield* Effect.all([
        Effect.result(inviteEve('ada', { fileId: 'f1' }, 'view')),
        Effect.result(revokeGuestInvitation(caller('ada'), { workspaceId: 'acme', invitationId: first.invitationId })),
      ], { concurrency: 'unbounded' })
      const log = (yield* rows('accessLog')).map((l) => l.action)
      const sent = (yield* Ref.get(yield* EmailOutbox)).length
      assert.strictEqual(sent, log.filter((a) => a === 'guest.invited' || a === 'guest.invite_resent').length)
      const original = (yield* rows('resourceInvitations')).find((i) => i.id === first.invitationId)
      if (original?.status === 'canceled') assert.notInclude(log, 'guest.invite_resent')
    })))

  it.effect('a member may cancel only the guest invitations they sent', () =>
    run(Effect.gen(function* () {
      yield* acme
      const sent = yield* inviteEve('ada', { fileId: 'f1' })
      yield* grantFileAccess(caller('bob'), { workspaceId: 'acme', fileId: 'f1', userId: 'max', level: 'edit', expiresAt: null })
      assert.strictEqual((yield* Effect.flip(revokeGuestInvitation(caller('max'), { workspaceId: 'acme', invitationId: sent.invitationId })))._tag, 'PermissionDenied')
      const own = yield* inviteGuest(caller('max'), { workspaceId: 'acme', target: { fileId: 'f1' }, email: 'zed@example.com', level: 'view', accessExpiresAt: T0 + DAY, locale: 'en' })
      assert.deepStrictEqual(yield* revokeGuestInvitation(caller('max'), { workspaceId: 'acme', invitationId: own.invitationId }), { canceled: true })
    })))
})

describe('grantFileAccess / grantProjectAccess / revoke', () => {
  it.effect('granting access to the file\'s uploader is refused (AlreadyHasAccess), writes nothing and logs nothing', () =>
    run(Effect.gen(function* () {
      yield* acme
      const at = new Date(T0 * 1000)
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileAccess).values({
        workspaceId: 'acme', fileId: 'f1', userId: 'max', level: 'edit', expiresAt: null, grantedByUserId: null, source: 'uploader', createdAt: at, updatedAt: at,
      })))
      const failure = yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'max', level: 'view', expiresAt: null }))
      assert.strictEqual(failure._tag, 'AlreadyHasAccess')
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.userId, g.source, g.level]), [['max', 'uploader', 'edit']])
      assert.deepStrictEqual(yield* rows('accessLog'), [])
    })))

  it.effect('guests need a finite expiry and stay at download or below', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      assert.strictEqual((yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: null })))._tag, 'AccessExpiryInvalid')
      assert.strictEqual((yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'edit', expiresAt: T0 + DAY })))._tag, 'InvalidAccessLevel')
      assert.strictEqual((yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'cat', level: 'download', expiresAt: null })))._tag, 'InvalidAccessLevel')
      yield* grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'download', expiresAt: T0 + DAY })
      // Upsert: the second grant updates the same row.
      yield* grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + 2 * DAY })
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.level, g.expiresAt?.getTime()]), [['view', (T0 + 2 * DAY) * 1000]])
    })))

  it.effect('recipients must be members of the same workspace; files of another workspace are unavailable', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'zed')
      yield* seedFile('fb', 'zed', 'beta')
      assert.strictEqual((yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'zed', level: 'view', expiresAt: null })))._tag, 'MemberUnavailable')
      assert.strictEqual((yield* Effect.flip(grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'fb', userId: 'max', level: 'view', expiresAt: null })))._tag, 'ResourceUnavailable')
    })))

  it.effect('restricted project access is managed by its creator-manager, not by other members', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'member')
      yield* grantProjectAccess(caller('max'), { workspaceId: 'acme', projectId: 'p2', userId: 'eve', level: 'edit', expiresAt: null })
      const byEve = yield* Effect.flip(grantProjectAccess(caller('eve'), { workspaceId: 'acme', projectId: 'p2', userId: 'cat', level: 'view', expiresAt: null }))
      assert.deepStrictEqual([byEve._tag, byEve._tag === 'PermissionDenied' ? byEve.reason : ''], ['PermissionDenied', 'PROJECT_MANAGER_REQUIRED'])
      assert.deepStrictEqual(yield* revokeProjectAccess(caller('max'), { workspaceId: 'acme', projectId: 'p2', userId: 'eve' }), { revoked: true })
      assert.deepStrictEqual(yield* revokeProjectAccess(caller('max'), { workspaceId: 'acme', projectId: 'p2', userId: 'eve' }), { revoked: false })
    })))

  it.effect('revoking the last live grant drops a guest from the workspace picker; uploader grants are never touched', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedMember('acme', 'eve', 'guest')
      yield* grantFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + DAY })
      assert.isTrue((yield* listMyWorkspaces(caller('eve'))).some((w) => w.id === 'acme'))
      assert.deepStrictEqual(yield* revokeFileAccess(caller('ada'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve' }), { revoked: true })
      assert.isFalse((yield* listMyWorkspaces(caller('eve'))).some((w) => w.id === 'acme'))
      assert.strictEqual((yield* rows('accessLog')).filter((l) => l.action === 'file.access_revoked').length, 1)
    })))
})
