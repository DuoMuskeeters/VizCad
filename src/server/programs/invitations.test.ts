import { assert, describe, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { EmailOutbox } from '../services/Email'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, seedUser, seedWorkspace, seedMember, seedFile, T0 } from '../testing/fixtures'
import { inviteGuest, revokeGuestInvitation } from './guests'
import { getInvitation } from './invitations'
import { inviteMember, revokeInvitation } from './members'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const DAY = 86400
const acme = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'new', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedFile('f1', 'bob', 'acme')
})

const memberInvite = Effect.gen(function* () {
  const sent = yield* inviteMember(caller('ada'), { workspaceId: 'acme', email: 'new@example.com', role: 'member', locale: 'en' })
  return sent.invitationId
})

const guestInvite = Effect.gen(function* () {
  const sent = yield* inviteGuest(caller('ada'), { workspaceId: 'acme', target: { fileId: 'f1' }, email: 'eve@example.com', level: 'comment', accessExpiresAt: T0 + 30 * DAY, locale: 'en' })
  const outbox = yield* Ref.get(yield* EmailOutbox)
  const token = /guest-invite\/([A-Za-z0-9_-]+)/.exec(outbox[outbox.length - 1]?.text ?? '')?.[1] ?? ''
  return { id: sent.invitationId, token }
})

const OTHER = { state: 'other_account' }

describe('getInvitation (member)', () => {
  it.effect('shows the card to the invited, verified account: inviter, workspace, role, expiry, state', () =>
    run(Effect.gen(function* () {
      yield* acme
      const id = yield* memberInvite
      assert.deepStrictEqual(yield* getInvitation(caller('new'), { kind: 'member', invitationId: id }), {
        state: 'pending', kind: 'member', workspaceName: 'Workspace acme', inviterEmail: 'ada@example.com',
        role: 'member', level: null, target: null, expiresAt: T0 + 7 * DAY, accessExpiresAt: null, emailMatches: true,
      })
    })))

  it.effect('another account, an unknown id and a stranger get the same bare answer: nothing leaks', () =>
    run(Effect.gen(function* () {
      yield* acme
      const id = yield* memberInvite
      assert.deepStrictEqual(yield* getInvitation(caller('zed'), { kind: 'member', invitationId: id }), OTHER)
      assert.deepStrictEqual(yield* getInvitation(caller('new'), { kind: 'member', invitationId: 'no-such-id' }), OTHER)
      assert.deepStrictEqual(yield* getInvitation(caller('zed'), { kind: 'member', invitationId: 'no-such-id' }), OTHER)
    })))

  it.effect('an unverified session is refused (it could claim any address)', () =>
    run(Effect.gen(function* () {
      yield* acme
      const id = yield* memberInvite
      const error = yield* Effect.flip(getInvitation(caller('new', { emailVerified: false }), { kind: 'member', invitationId: id }))
      assert.strictEqual(error._tag, 'EmailUnverified')
    })))

  it.effect('expired and canceled invitations say so to the invited account only', () =>
    run(Effect.gen(function* () {
      yield* acme
      const id = yield* memberInvite
      yield* TestClock.adjust('8 days')
      const expired = yield* getInvitation(caller('new'), { kind: 'member', invitationId: id })
      assert.strictEqual(expired.state, 'expired')
      assert.deepStrictEqual(yield* getInvitation(caller('zed'), { kind: 'member', invitationId: id }), OTHER)
      const fresh = yield* memberInvite
      yield* revokeInvitation(caller('bob'), { workspaceId: 'acme', invitationId: fresh })
      assert.strictEqual((yield* getInvitation(caller('new'), { kind: 'member', invitationId: fresh })).state, 'canceled')
    })))
})

describe('getInvitation (guest)', () => {
  it.effect('shows level, target kind and both deadlines to the invited account', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { token } = yield* guestInvite
      assert.deepStrictEqual(yield* getInvitation(caller('eve'), { kind: 'guest', token }), {
        state: 'pending', kind: 'guest', workspaceName: 'Workspace acme', inviterEmail: 'ada@example.com',
        role: null, level: 'comment', target: 'file', expiresAt: T0 + 7 * DAY, accessExpiresAt: T0 + 30 * DAY, emailMatches: true,
      })
    })))

  it.effect('an open invitation shows its card to the token holder on another account, flagged; closed ones do not', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { id, token } = yield* guestInvite
      const seen = yield* getInvitation(caller('zed'), { kind: 'guest', token })
      assert.strictEqual(seen.state, 'pending')
      assert.deepStrictEqual('emailMatches' in seen && seen.emailMatches, false)
      yield* revokeGuestInvitation(caller('ada'), { workspaceId: 'acme', invitationId: id })
      assert.deepStrictEqual(yield* getInvitation(caller('zed'), { kind: 'guest', token }), OTHER)
      assert.strictEqual((yield* getInvitation(caller('eve'), { kind: 'guest', token })).state, 'canceled')
    })))

  it.effect('an unknown token gets the same bare answer; an expired one is expired for the invited account only', () =>
    run(Effect.gen(function* () {
      yield* acme
      const { token } = yield* guestInvite
      assert.deepStrictEqual(yield* getInvitation(caller('eve'), { kind: 'guest', token: 'x'.repeat(43) }), OTHER)
      yield* TestClock.adjust('8 days')
      assert.strictEqual((yield* getInvitation(caller('eve'), { kind: 'guest', token })).state, 'expired')
      assert.deepStrictEqual(yield* getInvitation(caller('zed'), { kind: 'guest', token }), OTHER)
    })))
})
