import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { FileView } from '../../shared/fileViews'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { caller, programLayer, rows, seedFile, seedMember, seedProject, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { getFile, listFiles, renameFile, renamedTo, starFile, unstarFile } from './files'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed', 'gone']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
})

const update = (id: string, set: Partial<typeof schema.files.$inferInsert>) =>
  Db.use((db) => db.use((d) => d.update(schema.files).set(set).where(eq(schema.files.id, id))))

const names = (page: { items: ReadonlyArray<{ name: string }> }) => page.items.map((i) => i.name)
const list = (by: string, extra: Partial<Parameters<typeof listFiles>[1]> = {}) =>
  listFiles(caller(by), { workspaceId: 'acme', filter: 'all', sort: 'name', limit: 50, cursor: null, ...extra })

/** A legacy-shaped file: legacy key, no 0014 columns (NULL ETag, NULL version number, NULL uploader). */
const legacyFile = (id: string, owner: string, name: string) =>
  Db.use((db) => db.use((d) => d.insert(schema.files).values({
    id, name, r2Key: `${owner}/${id}/${name}`, size: 500, mimeType: 'application/octet-stream', extension: 'STEP', status: 'uploaded',
    userId: owner, createdAt: new Date(1_700_000_000_000), updatedAt: new Date(1_700_000_000_000), workspaceId: 'acme',
  })))

describe('renamedTo', () => {
  it.each([
    ['part.step', 'Bracket', 'Bracket.step'],
    ['part.step', 'Bracket.step', 'Bracket.step'],
    ['part.step', 'Bracket.STEP', 'Bracket.STEP'],
    ['part.STEP', 'v1.2', 'v1.2.STEP'],
    ['part.step', '  spaced  ', 'spaced.step'],
  ])('%s + %s -> %s', (current, typed, expected) => {
    assert.strictEqual(renamedTo({ name: current, extension: current.split('.').pop() ?? '' }, typed), expected)
  })
  it.each(['', '   ', '.step', 'a/b', 'a\\b', 'a\nb', 'x'.repeat(256)])('refuses %j', (typed) => {
    assert.strictEqual(renamedTo({ name: 'part.step', extension: 'step' }, typed), undefined)
  })
})

describe('listFiles', () => {
  it.effect('lists the workspace files by name, with filters, query, projects and keyset paging', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('p1', 'acme', 'bob')
      yield* seedFile('b', 'bob', 'acme')
      yield* seedFile('a', 'max', 'acme', 'p1')
      yield* seedFile('c', 'max', 'acme')
      yield* seedFile('trashed', 'bob', 'acme')
      yield* seedFile('foreign', 'zed', 'beta')
      yield* seedFile('nows', 'bob', null)
      yield* update('trashed', { isDeleted: true })
      yield* update('a', { name: 'Alpha.step' })
      yield* update('c', { name: 'charlie_100%.step' })
      yield* update('nows', { name: 'orphan.step' })
      const page = yield* list('max')
      assert.deepStrictEqual(names(page), ['Alpha.step', 'b.step', 'charlie_100%.step'])
      assert.strictEqual(page.nextCursor, null)
      assert.deepStrictEqual(names(yield* list('max', { projectId: 'p1' })), ['Alpha.step'])
      assert.deepStrictEqual(names(yield* list('max', { query: '100%' })), ['charlie_100%.step'])
      assert.deepStrictEqual(names(yield* list('max', { query: '_' })), ['charlie_100%.step'])
      assert.deepStrictEqual(names(yield* list('max', { filter: 'mine' })), ['Alpha.step', 'charlie_100%.step'])
      // paging
      const first = yield* list('max', { limit: 2 })
      assert.deepStrictEqual(names(first), ['Alpha.step', 'b.step'])
      const second = yield* list('max', { limit: 2, cursor: first.nextCursor })
      assert.deepStrictEqual(names(second), ['charlie_100%.step'])
      assert.strictEqual(second.nextCursor, null)
      // sort by size desc with ties broken by id
      yield* update('b', { size: 900 })
      assert.deepStrictEqual(names(yield* list('max', { sort: 'size' })), ['b.step', 'charlie_100%.step', 'Alpha.step'])
      const bySize = yield* list('max', { sort: 'size', limit: 1 })
      assert.deepStrictEqual(names(yield* list('max', { sort: 'size', limit: 5, cursor: bySize.nextCursor })), ['charlie_100%.step', 'Alpha.step'])
    })))

  it.effect('stars: starred filter, duplicates from legacy, unstar clears every row', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('f1', 'bob', 'acme')
      yield* seedFile('f2', 'bob', 'acme')
      yield* starFile(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      yield* starFile(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      assert.strictEqual((yield* Db.use((db) => db.use((d) => d.select().from(schema.fileStars).all()))).length, 1)
      // Legacy wrote duplicate rows.
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileStars).values([
        { id: 's2', fileId: 'f1', userId: 'max', createdAt: new Date(0) }, { id: 's3', fileId: 'f1', userId: 'max', createdAt: new Date(0) },
        { id: 's4', fileId: 'f1', userId: 'ada', createdAt: new Date(0) },
      ])))
      yield* starFile(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual(names(yield* list('max', { filter: 'starred' })), ['f1.step'])
      assert.deepStrictEqual(names(yield* list('cat', { filter: 'starred' })), [])
      assert.deepStrictEqual((yield* list('max')).items.map((i) => 'starred' in i && i.starred), [true, false])
      yield* unstarFile(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      const left = yield* Db.use((db) => db.use((d) => d.select().from(schema.fileStars).all()))
      assert.deepStrictEqual(left.map((s) => s.userId), ['ada'])
    })))

  it.effect('a guest sees only what their grants reach; a restricted project hides its files from members without access', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('open', 'acme', 'bob', 'team')
      yield* seedProject('closed', 'acme', 'bob', 'restricted')
      yield* seedFile('f-open', 'bob', 'acme', 'open')
      yield* seedFile('f-closed', 'bob', 'acme', 'closed')
      yield* seedFile('f-root', 'bob', 'acme')
      yield* seedFile('f-shared', 'bob', 'acme')
      const week = new Date((T0 + 7 * 86400) * 1000)
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileAccess).values({
        workspaceId: 'acme', fileId: 'f-shared', userId: 'eve', level: 'download', expiresAt: week, grantedByUserId: 'bob', source: 'grant',
        createdAt: new Date(0), updatedAt: new Date(0),
      })))
      assert.deepStrictEqual(names(yield* list('bob')), ['f-closed.step', 'f-open.step', 'f-root.step', 'f-shared.step'])
      assert.deepStrictEqual(names(yield* list('max')), ['f-open.step', 'f-root.step', 'f-shared.step'])
      const guest = yield* list('eve')
      assert.deepStrictEqual(names(guest), ['f-shared.step'])
      assert.deepStrictEqual(Object.keys(guest.items[0] ?? {}).sort(), ['can', 'currentVersion', 'extension', 'id', 'name', 'sharedBy', 'size', 'thumbnailAvailable', 'updatedAt'])
      // A project grant opens that project to the guest; a file grant does not open the project list.
      assert.strictEqual((yield* Effect.flip(list('eve', { projectId: 'open' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* Effect.flip(list('max', { projectId: 'closed' })))._tag, 'PermissionDenied')
      yield* Db.use((db) => db.use((d) => d.insert(schema.projectAccess).values({
        workspaceId: 'acme', projectId: 'open', userId: 'eve', level: 'view', expiresAt: week, grantedByUserId: 'ada', createdAt: new Date(0), updatedAt: new Date(0),
      })))
      assert.deepStrictEqual(names(yield* list('eve', { projectId: 'open' })), ['f-open.step'])
      assert.strictEqual((yield* list('eve', { projectId: 'open' })).items[0]?.['sharedBy' as never] !== undefined, true)
    })))

  it.effect('a removed member and a stranger get WorkspaceUnavailable; an expired guest grant lists nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('f1', 'bob', 'acme')
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileAccess).values({
        workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'download', expiresAt: new Date((T0 + 60) * 1000), grantedByUserId: 'bob', source: 'grant',
        createdAt: new Date(0), updatedAt: new Date(0),
      })))
      assert.strictEqual((yield* Effect.flip(list('gone')))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* Effect.flip(list('zed')))._tag, 'WorkspaceUnavailable')
      assert.deepStrictEqual(names(yield* list('eve')), ['f1.step'])
      yield* TestClock.adjust('2 minutes')
      assert.deepStrictEqual(names(yield* list('eve')), [])
    })))

  it.effect('lists a legacy-shaped file (legacy key, NULL version columns) and counts its version as COUNT + 1', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* legacyFile('old', 'bob', 'Old part.STEP')
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values([
        { id: 'v1', fileId: 'old', versionNumber: 1, r2Key: 'bob/old/v1/Old part.STEP', size: 400, uploadedByUserId: 'bob', createdAt: new Date(0) },
        { id: 'v1b', fileId: 'old', versionNumber: 1, r2Key: 'bob/old/v1/dup.STEP', size: 300, uploadedByUserId: 'bob', createdAt: new Date(0) },
      ])))
      const [item] = (yield* list('max')).items
      assert.deepStrictEqual(item === undefined ? null : (item as FileView).currentVersion, { number: 3, uploadedBy: { displayName: 'BOB' } })
    })))
})

describe('getFile projections', () => {
  it.effect('internal FileView: exact key set, per-action flags, no key / user id / e-mail', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('p1', 'acme', 'bob')
      yield* seedFile('f1', 'bob', 'acme', 'p1')
      const view = yield* getFile(caller('bob'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual(Object.keys(view).sort(), ['access', 'can', 'createdAt', 'currentVersion', 'extension', 'id', 'name', 'projectId', 'projectName', 'size', 'starred', 'thumbnailAvailable', 'updatedAt'])
      assert.deepStrictEqual((view as FileView).can, { edit: true, comment: true, download: true, viewHistory: true, trash: true, share: true })
      const member = yield* getFile(caller('max'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual((member as FileView).can, { edit: false, comment: true, download: true, viewHistory: true, trash: false, share: false })
      const commenter = yield* getFile(caller('cat'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual((commenter as FileView).can, { edit: false, comment: true, download: false, viewHistory: true, trash: false, share: false })
      const text = JSON.stringify(view)
      for (const forbidden of ['users/bob', 'r2Key', 'userId', '@example.com', 'bob@']) assert.notInclude(text, forbidden)
    })))

  it.effect('GuestFileView contract: exactly the allowed keys, nothing about project, versions, key or e-mail', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('p1', 'acme', 'bob')
      yield* seedFile('f1', 'bob', 'acme', 'p1')
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileAccess).values({
        workspaceId: 'acme', fileId: 'f1', userId: 'eve', level: 'comment', expiresAt: new Date((T0 + 86400) * 1000), grantedByUserId: 'ada', source: 'grant',
        createdAt: new Date(0), updatedAt: new Date(0),
      })))
      yield* update('f1', { thumbnailR2Key: 'w/acme/f/f1/o1.thumb' })
      const view = yield* getFile(caller('eve'), { workspaceId: 'acme', fileId: 'f1' })
      assert.deepStrictEqual(view, {
        id: 'f1', name: 'f1.step', extension: 'step', size: 100, updatedAt: T0 - 3600, currentVersion: { number: 1 }, thumbnailAvailable: true,
        can: { download: false, comment: true }, sharedBy: { displayName: 'ADA' },
      })
      const text = JSON.stringify(view)
      for (const forbidden of ['users/bob', 'w/acme', 'r2Key', 'userId', 'projectId', 'p1', '@example.com', 'versions']) assert.notInclude(text, forbidden)
    })))

  it.effect('matrix: who may open a file (owner, admin, member, commenter, guest with and without grant, removed, stranger, restricted project, trashed)', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('closed', 'acme', 'bob', 'restricted')
      yield* seedFile('f1', 'bob', 'acme')
      yield* seedFile('fc', 'bob', 'acme', 'closed')
      yield* seedFile('ft', 'bob', 'acme')
      yield* update('ft', { isDeleted: true })
      const open = (by: string, fileId: string) => getFile(caller(by), { workspaceId: 'acme', fileId }).pipe(Effect.map(() => 'ok'), Effect.catch((e) => Effect.succeed(e._tag)))
      for (const by of ['bob', 'ada', 'max', 'cat']) assert.strictEqual(yield* open(by, 'f1'), 'ok', by)
      assert.strictEqual(yield* open('eve', 'f1'), 'PermissionDenied')
      assert.strictEqual(yield* open('gone', 'f1'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* open('zed', 'f1'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* open('bob', 'fc'), 'ok')
      assert.strictEqual(yield* open('ada', 'fc'), 'ok')
      assert.strictEqual(yield* open('max', 'fc'), 'PermissionDenied')
      assert.strictEqual(yield* open('cat', 'fc'), 'PermissionDenied')
      for (const by of ['bob', 'max']) assert.strictEqual(yield* open(by, 'ft'), 'ResourceUnavailable', by)
      assert.strictEqual(yield* open('bob', 'missing'), 'ResourceUnavailable')
    })))
})

describe('renameFile', () => {
  it.effect('keeps the extension, writes the event without names, matrix of roles', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('closed', 'acme', 'bob', 'restricted')
      yield* seedFile('f1', 'max', 'acme')
      yield* seedUploaderGrant('f1', 'max', 'acme')
      yield* seedFile('fc', 'bob', 'acme', 'closed')
      yield* seedFile('fb', 'bob', 'acme')
      const rename = (by: string, fileId: string, name: string) => renameFile(caller(by), { workspaceId: 'acme', fileId, name }).pipe(Effect.map((r) => r.name), Effect.catch((e) => Effect.succeed(e._tag)))
      assert.strictEqual(yield* rename('max', 'f1', 'Bracket'), 'Bracket.step')
      assert.strictEqual(yield* rename('ada', 'f1', 'Bracket 2.step'), 'Bracket 2.step')
      assert.strictEqual(yield* rename('bob', 'f1', 'Bracket 3'), 'Bracket 3.step')
      assert.strictEqual(yield* rename('cat', 'f1', 'x'), 'PermissionDenied')
      assert.strictEqual(yield* rename('eve', 'f1', 'x'), 'PermissionDenied')
      assert.strictEqual(yield* rename('gone', 'f1', 'x'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* rename('zed', 'f1', 'x'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* rename('max', 'fc', 'x'), 'PermissionDenied')
      assert.strictEqual(yield* rename('max', 'fb', 'x'), 'PermissionDenied')
      assert.strictEqual(yield* rename('max', 'f1', 'a/b'), 'ValidationError')
      assert.strictEqual(yield* rename('max', 'f1', '.step'), 'ValidationError')
      assert.strictEqual((yield* rows('files')).find((f) => f.id === 'f1')?.name, 'Bracket 3.step')
      const log = (yield* rows('accessLog')).filter((r) => r.action === 'file.renamed')
      assert.strictEqual(log.length, 3)
      assert.deepStrictEqual(log.map((r) => [r.actorKind, r.targetKind, r.targetId, r.outcome]), Array(3).fill(['user', 'file', 'f1', 'allowed']))
      assert.notInclude(JSON.stringify(log), 'Bracket')
    })))
})
