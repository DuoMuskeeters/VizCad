import { assert, describe, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { MemoryAuth } from '../services/Auth'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedMember, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess } from './access'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { completeOnboarding, createWorkspace, ensurePersonalWorkspace, needsOnboarding, listMyWorkspaces, selectWorkspace, slugFrom, switchWorkspace } from './workspaces'

const setup = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))

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

  it.effect('a user owns at most `ownedWorkspaces` company workspaces; archived ones and other people\'s do not count', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      yield* seedUser('bob')
      yield* seedWorkspace('theirs', 'bob')
      yield* createWorkspace(caller('ada'), { name: 'One' })
      yield* createWorkspace(caller('ada'), { name: 'Two' })
      assert.strictEqual((yield* Effect.flip(createWorkspace(caller('ada'), { name: 'Three' })))._tag, 'WorkspaceLimitReached')
      assert.strictEqual((yield* rows('organization')).length, 3)
      yield* createWorkspace(caller('bob'), { name: 'Bobs' })
    }), { ...defaultPlan, ownedWorkspaces: 2 }))

  it.effect('two creations at once with one place left: exactly one workspace is written', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      const results = yield* Effect.all([
        Effect.result(createWorkspace(caller('ada'), { name: 'A' })),
        Effect.result(createWorkspace(caller('ada'), { name: 'B' })),
      ], { concurrency: 'unbounded' })
      assert.strictEqual(results.filter((r) => r._tag === 'Success').length, 1)
      assert.strictEqual((yield* rows('organization')).length, 1)
      assert.strictEqual((yield* rows('member')).length, 1)
      const failure = results.find((r) => r._tag === 'Failure')
      assert.include(['WorkspaceLimitReached', 'WriteConflict'], failure?._tag === 'Failure' ? failure.failure._tag : '')
    }), { ...defaultPlan, ownedWorkspaces: 1 }))

  it.effect('creation is rate limited per user per day (from Entitlements), before anything is written', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      yield* createWorkspace(caller('ada'), { name: 'One' })
      yield* createWorkspace(caller('ada'), { name: 'Two' })
      assert.strictEqual((yield* Effect.flip(createWorkspace(caller('ada'), { name: 'Three' })))._tag, 'RateLimitExceeded')
      assert.strictEqual((yield* rows('organization')).length, 2)
      yield* TestClock.adjust('25 hours')
      yield* createWorkspace(caller('ada'), { name: 'Three' })
    }), { ...defaultPlan, workspaceCreatesPerDay: 2 }))

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

describe('onboarding mark (D20)', () => {
  it.effect('a new sign-up needs onboarding until it is completed; completing twice changes nothing more', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ada')
      yield* seedUser('bob')
      assert.isFalse(yield* needsOnboarding(caller('ada'))) // no personal workspace yet
      yield* ensurePersonalWorkspace(caller('ada'))
      assert.isTrue(yield* needsOnboarding(caller('ada')))
      assert.deepStrictEqual(yield* completeOnboarding(caller('ada')), { completed: true })
      assert.isFalse(yield* needsOnboarding(caller('ada')))
      const first = (yield* rows('organization'))[0]?.onboardingCompletedAt?.getTime()
      assert.strictEqual(first, T0 * 1000)
      yield* TestClock.adjust('1 hour')
      yield* completeOnboarding(caller('ada'))
      assert.strictEqual((yield* rows('organization'))[0]?.onboardingCompletedAt?.getTime(), first)
      // Another account is not affected.
      yield* ensurePersonalWorkspace(caller('bob'))
      assert.isTrue(yield* needsOnboarding(caller('bob')))
    })))

  it.effect('an existing user whose personal workspace was stamped by the backfill never needs it', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('eve')
      yield* seedWorkspace('personal-eve', 'eve', 'personal')
      yield* Db.use((db) => db.use((d) => d.update(schema.organization).set({ onboardingCompletedAt: new Date((T0 - 86400) * 1000) })))
      assert.isFalse(yield* needsOnboarding(caller('eve')))
      assert.deepStrictEqual(yield* selectWorkspace(caller('eve'), null), 'personal-eve')
      assert.isFalse(yield* needsOnboarding(caller('eve')))
    })))

  it.effect('completing creates the personal workspace if the account has none yet (invitation-first sign-up)', () =>
    setup(Effect.gen(function* () {
      yield* seedUser('ivy')
      yield* completeOnboarding(caller('ivy'))
      assert.isFalse(yield* needsOnboarding(caller('ivy')))
      assert.strictEqual((yield* rows('organization')).length, 1)
    })))
})
