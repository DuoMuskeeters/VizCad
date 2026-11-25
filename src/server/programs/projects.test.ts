import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedFileGrant, seedMember, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { grantFileAccess, grantProjectAccess } from './access'
import { listActivity } from './activity'
import { archiveProject, createProject, listProjects, setProjectAccessMode, updateProject } from './projects'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))

const acme = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
})

const create = (by: string, accessMode: 'team' | 'restricted' = 'team', name = 'Bracket') =>
  createProject(caller(by), { workspaceId: 'acme', name, description: null, accessMode })

describe('createProject', () => {
  it.effect('owner/admin create without a manager mark; defaults to the team mode', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* create('ada')
      assert.strictEqual(p.accessMode, 'team')
      const [row] = yield* rows('projects')
      assert.deepStrictEqual([row?.createdByUserId, row?.creatorManagerUserId], ['ada', null])
      assert.strictEqual((yield* rows('projectAccess')).length, 0)
    })))

  it.effect('a member creator gets the manager mark and an edit grant in the same batch', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* create('max', 'restricted')
      const [row] = yield* rows('projects')
      assert.strictEqual(row?.creatorManagerUserId, 'max')
      assert.deepStrictEqual((yield* rows('projectAccess')).map((g) => [g.projectId, g.userId, g.level, g.expiresAt]), [[p.id, 'max', 'edit', null]])
    })))

  it.effect('commenters and guests cannot create; limits come from Entitlements', () =>
    run(Effect.gen(function* () {
      yield* acme
      assert.strictEqual((yield* Effect.flip(create('cat')))._tag, 'PermissionDenied')
      assert.strictEqual((yield* Effect.flip(create('eve')))._tag, 'PermissionDenied')
      yield* create('bob')
      assert.strictEqual((yield* Effect.flip(create('bob')))._tag, 'ProjectLimitReached')
      const restricted = yield* Effect.flip(create('bob', 'restricted'))
      assert.deepStrictEqual([restricted._tag, restricted._tag === 'PermissionDenied' ? restricted.reason : ''], ['PermissionDenied', 'FEATURE_UNAVAILABLE'])
    }), { ...defaultPlan, projects: 1, restrictedProjects: false }))

  it.effect("another workspace's project id is unavailable", () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'zed')
      const p = yield* createProject(caller('zed'), { workspaceId: 'beta', name: 'Secret', description: null, accessMode: 'team' })
      assert.strictEqual((yield* Effect.flip(updateProject(caller('bob'), { workspaceId: 'acme', projectId: p.id, name: 'x' })))._tag, 'ResourceUnavailable')
    })))
})

describe('updateProject / archiveProject', () => {
  it.effect('owner/admin only; an archived project is closed to further changes', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* create('max')
      assert.strictEqual((yield* Effect.flip(updateProject(caller('max'), { workspaceId: 'acme', projectId: p.id, name: 'New' })))._tag, 'PermissionDenied')
      const updated = yield* updateProject(caller('ada'), { workspaceId: 'acme', projectId: p.id, description: 'Rev B' })
      assert.deepStrictEqual([updated.name, updated.description], ['Bracket', 'Rev B'])
      yield* archiveProject(caller('ada'), { workspaceId: 'acme', projectId: p.id })
      assert.strictEqual((yield* rows('projects'))[0]?.archivedAt?.getTime(), T0 * 1000)
      assert.strictEqual((yield* Effect.flip(updateProject(caller('ada'), { workspaceId: 'acme', projectId: p.id, name: 'x' })))._tag, 'ResourceUnavailable')
    })))
})

describe('setProjectAccessMode', () => {
  it.effect('team -> restricted revokes links, cancels file invitations and removes ordinary file grants; keeps uploader and project grants', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* create('bob')
      yield* seedFile('f1', 'max', 'acme', p.id)
      const db = yield* Db
      const at = new Date(T0 * 1000)
      yield* db.use((d) => d.batch([
        d.insert(schema.fileAccess).values({ workspaceId: 'acme', fileId: 'f1', userId: 'max', level: 'edit', expiresAt: null, grantedByUserId: null, source: 'uploader', createdAt: at, updatedAt: at }),
        d.insert(schema.shareLinks).values({ id: 'l1', workspaceId: 'acme', fileId: 'f1', createdByUserId: 'bob', tokenDigest: 'dg', tokenCiphertext: 'ct', tokenKeyVersion: 1, level: 'view', revision: 1, createdAt: at, updatedAt: at }),
        d.insert(schema.resourceInvitations).values({ id: 'r1', workspaceId: 'acme', fileId: 'f1', email: 'x@example.com', level: 'view', expiresAt: new Date((T0 + 10) * 1000), accessExpiresAt: new Date((T0 + 20) * 1000), status: 'pending', tokenDigest: 'td', inviterId: 'bob', createdAt: at }),
      ]))
      yield* grantFileAccess(caller('bob'), { workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'view', expiresAt: T0 + 100 })
      yield* grantProjectAccess(caller('bob'), { workspaceId: 'acme', projectId: p.id, userId: 'cat', level: 'comment', expiresAt: null })

      yield* setProjectAccessMode(caller('ada'), { workspaceId: 'acme', projectId: p.id, accessMode: 'restricted' })
      assert.strictEqual((yield* rows('projects'))[0]?.accessMode, 'restricted')
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.userId, g.source]), [['max', 'uploader']])
      assert.deepStrictEqual((yield* rows('projectAccess')).map((g) => g.userId), ['cat'])
      assert.deepStrictEqual((yield* rows('shareLinks')).map((l) => [l.revokedAt?.getTime(), l.revision]), [[T0 * 1000, 2]])
      assert.deepStrictEqual((yield* rows('resourceInvitations')).map((r) => r.status), ['canceled'])
      // Same mode again: no-op, no extra activity.
      const before = (yield* rows('accessLog')).length
      yield* setProjectAccessMode(caller('ada'), { workspaceId: 'acme', projectId: p.id, accessMode: 'restricted' })
      assert.strictEqual((yield* rows('accessLog')).length, before)
    })))

  it.effect('a member creator cannot change the mode (settings are owner/admin)', () =>
    run(Effect.gen(function* () {
      yield* acme
      const p = yield* create('max', 'restricted')
      assert.strictEqual((yield* Effect.flip(setProjectAccessMode(caller('max'), { workspaceId: 'acme', projectId: p.id, accessMode: 'team' })))._tag, 'PermissionDenied')
    })))
})

describe('listActivity', () => {
  it.effect('owner/admin page through the workspace log newest first; members and guests are refused', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* create('bob', 'team', 'A')
      yield* TestClock.adjust('1 second')
      yield* create('bob', 'team', 'B')
      yield* TestClock.adjust('1 second')
      yield* create('ada', 'team', 'C')
      const first = yield* listActivity(caller('ada'), { workspaceId: 'acme', limit: 2, cursor: null })
      assert.deepStrictEqual(first.items.map((i) => [i.actorUserId, i.actorName, i.action, i.createdAt]), [['ada', 'ADA', 'project.created', T0 + 2], ['bob', 'BOB', 'project.created', T0 + 1]])
      assert.isNotNull(first.nextCursor)
      const second = yield* listActivity(caller('ada'), { workspaceId: 'acme', limit: 2, cursor: first.nextCursor })
      assert.deepStrictEqual(second.items.map((i) => i.createdAt), [T0])
      assert.isNull(second.nextCursor)
      assert.notInclude(JSON.stringify(first), '@')
      for (const who of ['max', 'eve']) {
        assert.strictEqual((yield* Effect.flip(listActivity(caller(who), { workspaceId: 'acme', limit: 10, cursor: null })))._tag, 'PermissionDenied')
      }
      assert.strictEqual((yield* Effect.flip(listActivity(caller('ada'), { workspaceId: 'acme', limit: 10, cursor: 'x' })))._tag, 'ValidationError')
    })))

  it.effect('never shows another workspace', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'zed')
      yield* createProject(caller('zed'), { workspaceId: 'beta', name: 'B', description: null, accessMode: 'team' })
      const page = yield* listActivity(caller('bob'), { workspaceId: 'acme', limit: 10, cursor: null })
      assert.strictEqual(page.items.length, 0)
      assert.strictEqual((yield* Effect.flip(listActivity(caller('bob'), { workspaceId: 'beta', limit: 10, cursor: null })))._tag, 'WorkspaceUnavailable')
    })))
})

describe('listProjects', () => {
  it.effect('shows team projects to everyone, restricted ones only to people with access; guests need a project grant', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedUser('zoe')
      const open = yield* create('ada', 'team', 'Open')
      const secret = yield* create('ada', 'restricted', 'Secret')
      const names = (userId: string) => listProjects(caller(userId), { workspaceId: 'acme' }).pipe(Effect.map((r) => r.items.map((p) => p.name)))
      assert.deepStrictEqual(yield* names('bob'), ['Open', 'Secret'])
      assert.deepStrictEqual(yield* names('ada'), ['Open', 'Secret'])
      assert.deepStrictEqual(yield* names('max'), ['Open'])
      assert.deepStrictEqual(yield* names('cat'), ['Open'])
      assert.deepStrictEqual(yield* names('eve'), [])
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: secret.id, userId: 'max', level: 'edit', expiresAt: null })
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: open.id, userId: 'eve', level: 'comment', expiresAt: T0 + 3600 })
      assert.deepStrictEqual(yield* names('max'), ['Open', 'Secret'])
      assert.deepStrictEqual(yield* names('eve'), ['Open'])
    })))

  it.effect('a file grant alone does not list its project; archived projects, other workspaces and trashed files stay out of the counts', () =>
    run(Effect.gen(function* () {
      yield* acme
      yield* seedWorkspace('beta', 'zed')
      const p = yield* create('ada', 'restricted', 'Secret')
      yield* seedFile('f1', 'ada', 'acme', p.id)
      yield* seedFile('f2', 'ada', 'acme', p.id)
      yield* seedFile('f3', 'ada', 'acme', p.id)
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 'f3'))))
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      assert.deepStrictEqual((yield* listProjects(caller('eve'), { workspaceId: 'acme' })).items, [])
      const bob = (yield* listProjects(caller('bob'), { workspaceId: 'acme' })).items
      assert.deepStrictEqual(bob.map((x) => [x.name, x.fileCount, x.createdBy?.displayName, x.can]), [['Secret', 2, 'ADA', { update: true, manageAccess: true, upload: true }]])
      yield* archiveProject(caller('ada'), { workspaceId: 'acme', projectId: p.id })
      assert.deepStrictEqual((yield* listProjects(caller('bob'), { workspaceId: 'acme' })).items, [])
      assert.strictEqual((yield* Effect.flip(listProjects(caller('bob'), { workspaceId: 'beta' })))._tag, 'WorkspaceUnavailable')
    })))

  it.effect('can.* follows decidePermission: a plain member updates nothing and cannot upload into a restricted project without edit', () =>
    run(Effect.gen(function* () {
      yield* acme
      const team = yield* create('ada', 'team', 'Team')
      const restricted = yield* create('ada', 'restricted', 'Closed')
      yield* grantProjectAccess(caller('ada'), { workspaceId: 'acme', projectId: restricted.id, userId: 'max', level: 'download', expiresAt: null })
      const items = (yield* listProjects(caller('max'), { workspaceId: 'acme' })).items
      assert.deepStrictEqual(items.map((x) => [x.name, x.can]), [
        ['Closed', { update: false, manageAccess: false, upload: false }],
        ['Team', { update: false, manageAccess: false, upload: true }],
      ])
      void team
    })))
})
