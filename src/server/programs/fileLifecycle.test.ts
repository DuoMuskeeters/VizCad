import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { eq, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import * as AppConfig from '../services/AppConfig'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { caller, programLayer, rows, seedFile, seedMember, seedProject, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { DAILY, HOURLY, runCron } from './cron'
import { listFiles } from './files'
import { moveFile, previewMoveFile } from './move'
import { drainStorageDeletions } from './storageCleanup'
import { emptyTrash, listTrash, purgeExpiredTrash, purgeFile, restoredName, restoreFile, trashFile } from './trash'
import { listVersions, restoreVersion } from './versions'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) => TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))
const DAY = 86400
const at = (seconds: number) => new Date(seconds * 1000)

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed', 'gone']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
})

const tag = <A, E extends { _tag: string }, R>(e: Effect.Effect<A, E, R>) => e.pipe(Effect.map(() => 'ok'), Effect.catch((error) => Effect.succeed(error._tag)))
const ref = { workspaceId: 'acme' }

const putObject = (key: string, text = 'data') => Storage.use((s) => s.put(key, text))
const bucket = MemoryStorageControl.use((c) => c.keys)

/** A file the way `completeUpload` writes it: workspace key, uploader grant, and optionally versions. */
const upload = (id: string, by: string, projectId: string | null = null) =>
  Effect.gen(function* () {
    yield* seedFile(id, by, 'acme', projectId)
    yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ r2Key: `w/acme/f/${id}/cur`, currentVersionNumber: 1, currentUploadedByUserId: by }).where(eq(schema.files.id, id))))
    yield* putObject(`w/acme/f/${id}/cur`)
    if (by !== 'bob' && by !== 'ada') yield* seedUploaderGrant(id, by, 'acme')
  })

const addLink = (fileId: string, id = `l-${fileId}`) =>
  Db.use((x) => x.use((d) => d.insert(schema.shareLinks).values({
    id, workspaceId: 'acme', fileId, createdByUserId: 'bob', tokenDigest: `dg-${id}`, tokenCiphertext: 'ct', tokenKeyVersion: 1, level: 'view',
    revision: 1, createdAt: at(T0), updatedAt: at(T0),
  })))

const addInvite = (fileId: string, email = 'x@partner.test') =>
  Db.use((x) => x.use((d) => d.insert(schema.resourceInvitations).values({
    id: `i-${fileId}-${email}`, workspaceId: 'acme', fileId, email, level: 'view', expiresAt: at(T0 + DAY), accessExpiresAt: at(T0 + 2 * DAY),
    status: 'pending', tokenDigest: `td-${fileId}-${email}`, inviterId: 'bob', createdAt: at(T0),
  })))

const grant = (fileId: string, userId: string, level: 'view' | 'comment' | 'download' | 'edit', source: 'grant' | 'uploader' = 'grant') =>
  Db.use((x) => x.use((d) => d.insert(schema.fileAccess).values({
    workspaceId: 'acme', fileId, userId, level, expiresAt: userId === 'eve' ? at(T0 + 30 * DAY) : null, grantedByUserId: 'bob', source, createdAt: at(T0), updatedAt: at(T0),
  })))

const addVersion = (id: string, fileId: string, number: number, key: string, size = 50, extra: Partial<typeof schema.fileVersions.$inferInsert> = {}) =>
  Db.use((x) => x.use((d) => d.insert(schema.fileVersions).values({
    id, fileId, versionNumber: number, r2Key: key, size, uploadedByUserId: 'bob', createdAt: at(T0 - DAY), ...extra,
  })))

const file = (id: string) => Db.use((x) => x.use((d) => d.select().from(schema.files).where(eq(schema.files.id, id)).get()))

describe('restoredName', () => {
  it('adds a suffix before the extension and numbers further clashes', () => {
    assert.strictEqual(restoredName('part.step', 'step', new Set(['part.step'])), 'part (2).step')
    assert.strictEqual(restoredName('part.step', 'step', new Set(['part.step', 'part (2).step'])), 'part (3).step')
    assert.strictEqual(restoredName('noext', 'step', new Set()), 'noext (2)')
  })
})

describe('trashFile / restoreFile / listTrash', () => {
  it.effect('permission matrix for trash and restore; trash revokes links and cancels external invitations in the same batch', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('closed', 'acme', 'bob', 'restricted')
      yield* upload('mine', 'max')
      yield* upload('theirs', 'bob')
      yield* upload('closedf', 'bob', 'closed')
      yield* addLink('mine')
      yield* addLink('mine', 'l-mine-2').pipe(Effect.ignore)
      yield* addInvite('mine')
      const trash = (by: string, fileId: string) => tag(trashFile(caller(by), { ...ref, fileId }))
      assert.strictEqual(yield* trash('cat', 'mine'), 'PermissionDenied')
      assert.strictEqual(yield* trash('eve', 'mine'), 'PermissionDenied')
      assert.strictEqual(yield* trash('max', 'theirs'), 'PermissionDenied')
      assert.strictEqual(yield* trash('max', 'closedf'), 'PermissionDenied')
      assert.strictEqual(yield* trash('gone', 'mine'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* trash('zed', 'mine'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* trash('max', 'mine'), 'ok')
      assert.strictEqual(yield* trash('max', 'mine'), 'ResourceUnavailable')
      const [link] = (yield* rows('shareLinks')).filter((l) => l.id === 'l-mine')
      assert.deepStrictEqual([link?.revokedAt === null, link?.revision], [false, 2])
      assert.deepStrictEqual((yield* rows('resourceInvitations')).map((i) => i.status), ['canceled'])
      const trashed = yield* file('mine')
      assert.deepStrictEqual([trashed?.isDeleted, trashed?.deletedByUserId, trashed?.deletedAt?.getTime()], [true, 'max', T0 * 1000])
      assert.strictEqual(yield* trash('ada', 'closedf'), 'ok')
      assert.strictEqual(yield* trash('bob', 'theirs'), 'ok')
      assert.deepStrictEqual((yield* rows('accessLog')).filter((r) => r.action === 'file.trashed').map((r) => [r.actorUserId, r.targetId]), [['max', 'mine'], ['ada', 'closedf'], ['bob', 'theirs']])
    })))

  it.effect('restore: matrix, a clashing name gets the suffix, links stay revoked, trashed files are not listed', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('f1', 'max')
      yield* addLink('f1')
      yield* trashFile(caller('max'), { ...ref, fileId: 'f1' })
      // A new file took the name meanwhile.
      yield* upload('f2', 'max')
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ name: 'f1.step' }).where(eq(schema.files.id, 'f2'))))
      const restore = (by: string) => tag(restoreFile(caller(by), { ...ref, fileId: 'f1' }))
      assert.strictEqual(yield* restore('cat'), 'PermissionDenied')
      assert.strictEqual(yield* restore('eve'), 'PermissionDenied')
      assert.strictEqual(yield* restore('gone'), 'WorkspaceUnavailable')
      const other = yield* upload('f3', 'bob')
      void other
      assert.strictEqual(yield* restore('max'), 'ok')
      assert.strictEqual(yield* restore('max'), 'ResourceUnavailable')
      const restored = yield* file('f1')
      assert.deepStrictEqual([restored?.isDeleted, restored?.deletedAt, restored?.deletedByUserId, restored?.name], [false, null, null, 'f1 (2).step'])
      assert.strictEqual((yield* rows('shareLinks'))[0]?.revokedAt === null, false)
      const page = yield* listFiles(caller('max'), { ...ref, filter: 'all', sort: 'name', limit: 10, cursor: null })
      assert.strictEqual(page.items.length, 3)
    })))

  it.effect('listTrash shows what the caller may restore, with the retention date; commenters and guests see nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('a', 'max')
      yield* upload('b', 'bob')
      yield* trashFile(caller('max'), { ...ref, fileId: 'a' })
      yield* TestClock.adjust('1 hour')
      yield* trashFile(caller('bob'), { ...ref, fileId: 'b' })
      const list = (by: string, extra = {}) => listTrash(caller(by), { ...ref, limit: 10, cursor: null, ...extra })
      const owner = yield* list('bob')
      assert.deepStrictEqual(owner.items.map((i) => [i.id, i.deletedBy?.displayName, i.purgeAt, i.can]), [
        ['b', 'BOB', T0 + 3600 + 30 * DAY, { restore: true, purge: true }],
        ['a', 'MAX', T0 + 30 * DAY, { restore: true, purge: true }],
      ])
      assert.deepStrictEqual((yield* list('max')).items.map((i) => [i.id, i.can]), [['a', { restore: true, purge: false }]])
      for (const by of ['cat', 'eve']) assert.deepStrictEqual((yield* list(by)).items, [], by)
      assert.strictEqual((yield* tag(list('gone'))), 'WorkspaceUnavailable')
      const first = yield* list('bob', { limit: 1 })
      assert.deepStrictEqual([first.items.map((i) => i.id), first.nextCursor !== null], [['b'], true])
      const second = yield* list('bob', { limit: 1, cursor: first.nextCursor })
      assert.deepStrictEqual([second.items.map((i) => i.id), second.nextCursor], [['a'], null])
    })))
})

describe('purge', () => {
  it.effect('only owner and admin purge, and only from the trash; everything the file held leaves D1 and R2, the log stays', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('f1', 'max')
      yield* addVersion('v1', 'f1', 1, 'w/acme/f/f1/old1')
      yield* addVersion('v2', 'f1', 2, 'w/acme/f/f1/old2', 50, { thumbnailR2Key: 'w/acme/f/f1/old2.thumb' })
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ thumbnailR2Key: 'w/acme/f/f1/cur.thumb' }).where(eq(schema.files.id, 'f1'))))
      for (const key of ['old1', 'old2', 'old2.thumb', 'cur.thumb']) yield* putObject(`w/acme/f/f1/${key}`)
      yield* putObject('blog/hero.png')
      yield* upload('keep', 'max')
      yield* addLink('f1')
      yield* addInvite('f1')
      yield* grant('f1', 'cat', 'view')
      yield* Db.use((x) => x.use((d) => d.insert(schema.fileStars).values({ id: 's1', fileId: 'f1', userId: 'max', createdAt: at(0) })))
      const purge = (by: string) => tag(purgeFile(caller(by), { ...ref, fileId: 'f1' }))
      assert.strictEqual(yield* purge('ada'), 'ResourceUnavailable') // not in the trash
      yield* trashFile(caller('max'), { ...ref, fileId: 'f1' })
      for (const by of ['max', 'cat', 'eve']) assert.strictEqual(yield* purge(by), 'PermissionDenied', by)
      assert.strictEqual(yield* purge('gone'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* purge('zed'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* purge('ada'), 'ok')
      assert.strictEqual(yield* file('f1'), undefined)
      assert.deepStrictEqual((yield* rows('fileVersions')).length, 0)
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => g.fileId), ['keep'])
      assert.deepStrictEqual([(yield* rows('shareLinks')).length, (yield* rows('resourceInvitations')).length, (yield* rows('fileStars')).length], [0, 0, 0])
      assert.deepStrictEqual((yield* bucket).slice().sort(), ['blog/hero.png', 'w/acme/f/keep/cur'])
      assert.deepStrictEqual((yield* rows('storageDeletions')).length, 0)
      const purged = (yield* rows('accessLog')).filter((r) => r.action === 'file.purged')
      assert.deepStrictEqual(purged.map((r) => [r.actorKind, r.actorUserId, r.targetId]), [['user', 'ada', 'f1']])
    })))

  it.effect('queues each key once, keeps the queue row when R2 fails, and never touches blog/ or a key another file still uses', () =>
    run(Effect.gen(function* () {
      yield* world
      // A legacy file whose current key is also a version row (restored version), a key shared with another file's version, and a blog/ key.
      yield* seedFile('legacy', 'max', 'acme')
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ r2Key: 'max/legacy/doc.step', isDeleted: true, deletedAt: at(T0) }).where(eq(schema.files.id, 'legacy'))))
      yield* addVersion('lv1', 'legacy', 1, 'max/legacy/doc.step')
      yield* addVersion('lv2', 'legacy', 2, 'max/legacy/v1/doc.step')
      yield* addVersion('lv3', 'legacy', 3, 'max/other/shared.step')
      yield* addVersion('lv4', 'legacy', 3, 'blog/cover.png')
      yield* seedFile('other', 'max', 'acme')
      yield* addVersion('ov1', 'other', 1, 'max/other/shared.step')
      for (const key of ['max/legacy/doc.step', 'max/legacy/v1/doc.step', 'max/other/shared.step', 'blog/cover.png']) yield* putObject(key)
      yield* Storage.use((s) => s.put('max/other/doc.step', 'x'))
      const control = yield* MemoryStorageControl
      yield* control.failDeletes(true)
      yield* purgeFile(caller('bob'), { ...ref, fileId: 'legacy' })
      const queued = (yield* rows('storageDeletions')).map((r) => [r.key, r.reason, r.attempts]).sort()
      assert.deepStrictEqual(queued, [['max/legacy/doc.step', 'purged', 1], ['max/legacy/v1/doc.step', 'purged', 1]])
      yield* control.failDeletes(false)
      yield* TestClock.adjust('2 minutes')
      const summary = yield* drainStorageDeletions()
      assert.deepStrictEqual(summary, { deleted: 2, skipped: 0, failed: 0 })
      assert.deepStrictEqual((yield* bucket).slice().sort(), ['blog/cover.png', 'max/other/doc.step', 'max/other/shared.step'])
      assert.strictEqual((yield* rows('fileVersions')).filter((v) => v.fileId === 'other').length, 1)
    })))

  it.effect('emptyTrash purges in groups, needs owner or admin, skips files in archived projects', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('old', 'acme', 'bob')
      for (const id of ['a', 'b', 'c']) yield* upload(id, 'max')
      yield* upload('arch', 'bob', 'old')
      for (const id of ['a', 'b', 'c', 'arch']) yield* trashFile(caller('bob'), { ...ref, fileId: id })
      yield* Db.use((x) => x.use((d) => d.update(schema.projects).set({ archivedAt: at(T0) }).where(eq(schema.projects.id, 'old'))))
      assert.strictEqual(yield* tag(emptyTrash(caller('max'), ref)), 'PermissionDenied')
      assert.strictEqual(yield* tag(emptyTrash(caller('cat'), ref)), 'PermissionDenied')
      assert.strictEqual(yield* tag(emptyTrash(caller('zed'), ref)), 'WorkspaceUnavailable')
      assert.deepStrictEqual(yield* emptyTrash(caller('ada'), ref), { purged: 3, more: false })
      assert.deepStrictEqual((yield* rows('files')).map((f) => f.id), ['arch'])
      assert.deepStrictEqual(yield* bucket, ['w/acme/f/arch/cur'])
    })))

  it.effect('emptyTrash does not count a file that conflicts, and does not ask the client to call again when nothing progressed', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const id of ['a', 'b', 'c']) yield* upload(id, 'max')
      for (const id of ['a', 'b', 'c']) yield* trashFile(caller('bob'), { ...ref, fileId: id })
      // A concurrent change makes the purge of "c" lose its batch.
      yield* Db.use((x) => x.use((d) => d.run(sql`CREATE TRIGGER conflict_c BEFORE DELETE ON file_access WHEN OLD.fileId = 'c' BEGIN SELECT RAISE(ABORT, 'batch_guard_failed'); END`)))
      assert.deepStrictEqual(yield* emptyTrash(caller('ada'), ref), { purged: 2, more: false })
      assert.deepStrictEqual((yield* rows('files')).map((f) => f.id), ['c'])
      assert.deepStrictEqual(yield* emptyTrash(caller('ada'), ref), { purged: 0, more: false })
    })))

  it.effect('the retention floor: trash counts from max(deletion time, floor), in the list and in the daily job', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('legacy', 'max')
      yield* trashFile(caller('max'), { ...ref, fileId: 'legacy' })
      const floor = T0 + 20 * DAY
      yield* TestClock.adjust(`${31 * DAY} seconds`) // 31 days after deletion, but only 11 after the floor
      assert.deepStrictEqual((yield* listTrash(caller('max'), { ...ref, limit: 5, cursor: null })).items.map((i) => [i.id, i.deletedAt, i.purgeAt]), [['legacy', T0, floor + 30 * DAY]])
      assert.deepStrictEqual(yield* purgeExpiredTrash(), { purged: 0 })
      yield* TestClock.adjust(`${20 * DAY} seconds`)
      assert.deepStrictEqual(yield* purgeExpiredTrash(), { purged: 1 })
    }).pipe(Effect.provide(AppConfig.test({ trashRetentionFloor: T0 + 20 * DAY })))))

  it.effect('the daily job purges files past the workspace retention as the system and leaves younger ones', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('old', 'max')
      yield* upload('young', 'max')
      yield* upload('live', 'max')
      yield* trashFile(caller('max'), { ...ref, fileId: 'old' })
      yield* TestClock.adjust(`${20 * DAY} seconds`)
      yield* trashFile(caller('max'), { ...ref, fileId: 'young' })
      yield* TestClock.adjust(`${11 * DAY} seconds`)
      assert.deepStrictEqual(yield* purgeExpiredTrash(), { purged: 1 })
      assert.deepStrictEqual((yield* rows('files')).map((f) => f.id).sort(), ['live', 'young'])
      const [purged] = (yield* rows('accessLog')).filter((r) => r.action === 'file.purged')
      assert.deepStrictEqual([purged?.actorKind, purged?.actorUserId, purged?.targetId], ['system', null, 'old'])
      yield* drainStorageDeletions()
      assert.deepStrictEqual((yield* bucket).slice().sort(), ['w/acme/f/live/cur', 'w/acme/f/young/cur'])
      yield* TestClock.adjust(`${20 * DAY} seconds`)
      assert.deepStrictEqual(yield* purgeExpiredTrash(), { purged: 1 })
    })))
})

describe('cron', () => {
  it.effect('the daily run purges expired trash, the hourly run then deletes the queued objects', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('old', 'max')
      yield* trashFile(caller('max'), { ...ref, fileId: 'old' })
      yield* TestClock.adjust(`${31 * DAY} seconds`)
      yield* runCron(DAILY)
      assert.deepStrictEqual([(yield* rows('files')).length, (yield* rows('storageDeletions')).length, yield* bucket], [0, 1, ['w/acme/f/old/cur']])
      assert.deepStrictEqual((yield* rows('storageDeletions')).map((r) => r.reason), ['trash_retention'])
      yield* runCron(HOURLY)
      assert.deepStrictEqual([(yield* rows('storageDeletions')).length, yield* bucket], [0, []])
    })))
})

describe('versions', () => {
  it.effect('listVersions: current first, then snapshots newest first; guests are refused, others may read', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('f1', 'max')
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ currentVersionNumber: 3 }).where(eq(schema.files.id, 'f1'))))
      yield* addVersion('v1', 'f1', 1, 'k1', 10)
      yield* addVersion('v2', 'f1', 2, 'k2', 20, { thumbnailR2Key: 'k2.thumb' })
      yield* grant('f1', 'eve', 'download')
      const list = yield* listVersions(caller('cat'), { ...ref, fileId: 'f1' })
      assert.deepStrictEqual(list.current, { id: 'current', number: 3, size: 100, uploadedBy: { displayName: 'MAX' }, createdAt: T0 - 3600, thumbnailAvailable: false })
      assert.deepStrictEqual(list.versions.map((v) => [v.id, v.number, v.size, v.thumbnailAvailable, v.uploadedBy?.displayName]), [['v2', 2, 20, true, 'BOB'], ['v1', 1, 10, false, 'BOB']])
      assert.notInclude(JSON.stringify(list), 'w/acme')
      assert.notInclude(JSON.stringify(list), '@example.com')
      assert.strictEqual(yield* tag(listVersions(caller('eve'), { ...ref, fileId: 'f1' })), 'PermissionDenied')
      assert.strictEqual(yield* tag(listVersions(caller('gone'), { ...ref, fileId: 'f1' })), 'WorkspaceUnavailable')
      assert.strictEqual(yield* tag(listVersions(caller('zed'), { ...ref, fileId: 'f1' })), 'WorkspaceUnavailable')
    })))

  it.effect('restoreVersion snapshots the current state, makes the old object current under a higher number, queues nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* upload('f1', 'max')
      yield* upload('fb', 'bob')
      yield* Db.use((x) => x.use((d) => d.update(schema.files).set({ currentVersionNumber: 2, contentEtag: 'cur-etag', size: 100 }).where(eq(schema.files.id, 'f1'))))
      yield* addVersion('v1', 'f1', 1, 'w/acme/f/f1/v1', 40, { contentEtag: 'v1-etag', uploadedByUserId: 'ada' })
      yield* addVersion('vb', 'fb', 1, 'w/acme/f/fb/v1')
      const restore = (by: string, fileId: string, versionId: string) => tag(restoreVersion(caller(by), { ...ref, fileId, versionId }))
      assert.strictEqual(yield* restore('cat', 'f1', 'v1'), 'PermissionDenied')
      assert.strictEqual(yield* restore('eve', 'f1', 'v1'), 'PermissionDenied')
      assert.strictEqual(yield* restore('max', 'fb', 'vb'), 'PermissionDenied')
      assert.strictEqual(yield* restore('gone', 'f1', 'v1'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* restore('max', 'f1', 'vb'), 'VersionUnavailable') // another file's version
      assert.strictEqual(yield* restore('max', 'f1', 'missing'), 'VersionUnavailable')
      assert.strictEqual(yield* restore('max', 'f1', 'v1'), 'ok')
      const now = yield* file('f1')
      assert.deepStrictEqual([now?.r2Key, now?.size, now?.contentEtag, now?.currentVersionNumber, now?.currentUploadedByUserId, now?.name], ['w/acme/f/f1/v1', 40, 'v1-etag', 3, 'ada', 'f1.step'])
      const versions = (yield* rows('fileVersions')).filter((v) => v.fileId === 'f1').map((v) => [v.versionNumber, v.r2Key, v.size, v.contentEtag, v.uploadedByUserId]).sort()
      assert.deepStrictEqual(versions, [[1, 'w/acme/f/f1/v1', 40, 'v1-etag', 'ada'], [2, 'w/acme/f/f1/cur', 100, 'cur-etag', 'max']])
      assert.deepStrictEqual((yield* rows('storageDeletions')).length, 0)
      // Restoring again moves on (the key now sits in the file row and a version row).
      assert.strictEqual(yield* restore('max', 'f1', 'v1'), 'ok')
      assert.strictEqual((yield* file('f1'))?.currentVersionNumber, 4)
      assert.deepStrictEqual((yield* rows('accessLog')).filter((r) => r.action === 'file.version_restored').length, 2)
      yield* trashFile(caller('max'), { ...ref, fileId: 'f1' })
      assert.strictEqual(yield* restore('max', 'f1', 'v1'), 'ResourceUnavailable')
    })))
})

describe('moveFile', () => {
  const world2 = Effect.gen(function* () {
    yield* world
    yield* seedProject('team', 'acme', 'bob', 'team')
    yield* seedProject('closed', 'acme', 'bob', 'restricted')
    yield* seedProject('mgr', 'acme', 'max', 'restricted', 'max')
    yield* seedProject('arch', 'acme', 'bob', 'team')
    yield* Db.use((x) => x.use((d) => d.update(schema.projects).set({ archivedAt: at(T0) }).where(eq(schema.projects.id, 'arch'))))
    yield* Db.use((x) => x.use((d) => d.insert(schema.projectAccess).values({ workspaceId: 'acme', projectId: 'mgr', userId: 'max', level: 'edit', expiresAt: null, grantedByUserId: 'max', createdAt: at(0), updatedAt: at(0) })))
    yield* seedProject('foreign', 'beta', 'zed')
  })

  it.effect('into a restricted project: preview counts, then links, invitations, guest and member grants go in the same batch; the uploader grant stays', () =>
    run(Effect.gen(function* () {
      yield* world2
      yield* upload('f1', 'max')
      yield* addLink('f1')
      yield* addInvite('f1')
      yield* addInvite('f1', 'y@partner.test')
      yield* grant('f1', 'eve', 'download')
      yield* grant('f1', 'cat', 'view')
      const preview = yield* previewMoveFile(caller('ada'), { ...ref, fileId: 'f1', targetProjectId: 'closed' })
      assert.deepStrictEqual(preview.effects, { links: 1, invitations: 2, guestGrants: 1, memberGrants: 1 })
      assert.deepStrictEqual((yield* previewMoveFile(caller('ada'), { ...ref, fileId: 'f1', targetProjectId: 'team' })).effects, { links: 0, invitations: 0, guestGrants: 0, memberGrants: 0 })
      // A stale confirmation fails and moves nothing.
      assert.strictEqual(yield* tag(moveFile(caller('ada'), { ...ref, fileId: 'f1', targetProjectId: 'closed', expected: { links: 0, invitations: 2, guestGrants: 1, memberGrants: 1 } })), 'WriteConflict')
      assert.strictEqual((yield* file('f1'))?.projectId, null)
      const done = yield* moveFile(caller('ada'), { ...ref, fileId: 'f1', targetProjectId: 'closed', expected: preview.effects })
      assert.deepStrictEqual([done.moved, done.projectId], [true, 'closed'])
      assert.strictEqual((yield* file('f1'))?.projectId, 'closed')
      const [link] = yield* rows('shareLinks')
      assert.deepStrictEqual([link?.revokedAt === null, link?.revision], [false, 2])
      assert.deepStrictEqual((yield* rows('resourceInvitations')).map((i) => i.status), ['canceled', 'canceled'])
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.userId, g.source]), [['max', 'uploader']])
      assert.deepStrictEqual((yield* rows('accessLog')).filter((r) => r.action === 'file.moved').map((r) => [r.targetId, r.actorUserId]), [['f1', 'ada']])
      // The project's own access is untouched.
      assert.deepStrictEqual((yield* rows('projectAccess')).map((g) => g.projectId), ['mgr'])
    })))

  it.effect('permission matrix: write on the source, the destination rule, restricted projects need a manager, no cross-workspace move', () =>
    run(Effect.gen(function* () {
      yield* world2
      yield* upload('mine', 'max')
      yield* upload('bobs', 'bob')
      yield* upload('inclosed', 'bob', 'closed')
      yield* upload('inmgr', 'max', 'mgr')
      const move = (by: string, fileId: string, targetProjectId: string | null) => tag(moveFile(caller(by), { ...ref, fileId, targetProjectId }))
      assert.strictEqual(yield* move('max', 'mine', 'team'), 'ok')
      assert.strictEqual(yield* move('max', 'mine', null), 'ok')
      assert.strictEqual(yield* move('max', 'mine', null), 'ok') // same place: no-op
      assert.strictEqual((yield* rows('accessLog')).filter((r) => r.action === 'file.moved').length, 2)
      assert.strictEqual(yield* move('max', 'bobs', 'team'), 'PermissionDenied') // no write on the source
      assert.strictEqual(yield* move('cat', 'mine', 'team'), 'PermissionDenied')
      assert.strictEqual(yield* move('eve', 'mine', 'team'), 'PermissionDenied')
      assert.strictEqual(yield* move('max', 'mine', 'closed'), 'PermissionDenied') // not that project's manager
      assert.strictEqual(yield* move('max', 'mine', 'mgr'), 'ok') // manager of the destination
      assert.strictEqual(yield* move('max', 'inmgr', 'team'), 'ok') // manager leaving a restricted project
      assert.strictEqual(yield* move('max', 'inclosed', 'team'), 'PermissionDenied')
      assert.strictEqual(yield* move('ada', 'inclosed', 'team'), 'ok')
      assert.strictEqual(yield* move('max', 'bobs', 'arch'), 'PermissionDenied')
      assert.strictEqual(yield* move('ada', 'bobs', 'arch'), 'ResourceUnavailable')
      assert.strictEqual(yield* move('ada', 'bobs', 'foreign'), 'ResourceUnavailable')
      assert.strictEqual(yield* move('ada', 'bobs', 'missing'), 'ResourceUnavailable')
      assert.strictEqual(yield* move('gone', 'mine', 'team'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* move('zed', 'mine', 'team'), 'WorkspaceUnavailable')
      assert.strictEqual(yield* tag(previewMoveFile(caller('cat'), { ...ref, fileId: 'mine', targetProjectId: 'team' })), 'PermissionDenied')
    })))

  it.effect('a trashed file cannot be moved', () =>
    run(Effect.gen(function* () {
      yield* world2
      yield* upload('f1', 'max')
      yield* trashFile(caller('max'), { ...ref, fileId: 'f1' })
      assert.strictEqual(yield* tag(moveFile(caller('ada'), { ...ref, fileId: 'f1', targetProjectId: 'team' })), 'ResourceUnavailable')
    })))
})

describe('legacy-shaped file: list, version, restore, trash, purge (shared key included)', () => {
  it.effect('goes through the whole lifecycle and leaves nothing in R2 except blog/', () =>
    run(Effect.gen(function* () {
      yield* world
      const legacyKey = 'max/lf/Old part.STEP'
      yield* Db.use((x) => x.use((d) => d.insert(schema.files).values({
        id: 'lf', name: 'Old part.STEP', r2Key: legacyKey, size: 500, mimeType: 'application/octet-stream', extension: 'STEP', status: 'uploaded',
        userId: 'max', createdAt: at(1_700_000_000), updatedAt: at(1_700_000_000), workspaceId: 'acme', thumbnailR2Key: 'max/lf/thumbnail.png',
      })))
      yield* seedUploaderGrant('lf', 'max', 'acme')
      // Legacy version history: a snapshot, and a duplicate number from a race. The first snapshot shares the current key (a legacy restore).
      yield* addVersion('lv1', 'lf', 1, legacyKey, 500, { uploadedByUserId: 'max' })
      yield* addVersion('lv2', 'lf', 1, 'max/lf/v1/Old part.STEP', 300, { uploadedByUserId: 'max' })
      for (const key of [legacyKey, 'max/lf/v1/Old part.STEP', 'max/lf/thumbnail.png', 'blog/hero.png']) yield* putObject(key)
      // 1) listed
      const page = yield* listFiles(caller('max'), { ...ref, filter: 'all', sort: 'name', limit: 10, cursor: null })
      assert.deepStrictEqual(page.items.map((i) => [i.name, i.thumbnailAvailable, 'currentVersion' in i ? i.currentVersion.number : 0]), [['Old part.STEP', true, 3]])
      // 2) versioned: the history lists both snapshots, the current is number 3
      const history = yield* listVersions(caller('max'), { ...ref, fileId: 'lf' })
      assert.deepStrictEqual([history.current.number, history.versions.map((v) => v.number)], [3, [1, 1]])
      // 3) restored: the second snapshot becomes current as number 3 and the old current is snapshotted as 3
      yield* restoreVersion(caller('max'), { ...ref, fileId: 'lf', versionId: 'lv2' })
      const after = yield* file('lf')
      assert.deepStrictEqual([after?.r2Key, after?.size, after?.currentVersionNumber], ['max/lf/v1/Old part.STEP', 300, 4])
      assert.deepStrictEqual((yield* rows('fileVersions')).map((v) => [v.versionNumber, v.r2Key]).sort(), [[1, legacyKey], [1, 'max/lf/v1/Old part.STEP'], [3, legacyKey]])
      // 4) trashed, 5) purged: every key goes once, the shared key too, thumbnails included
      yield* trashFile(caller('max'), { ...ref, fileId: 'lf' })
      assert.deepStrictEqual((yield* listTrash(caller('max'), { ...ref, limit: 5, cursor: null })).items.map((i) => i.id), ['lf'])
      yield* purgeFile(caller('bob'), { ...ref, fileId: 'lf' })
      assert.deepStrictEqual(yield* bucket, ['blog/hero.png'])
      assert.deepStrictEqual([(yield* rows('files')).length, (yield* rows('fileVersions')).length, (yield* rows('storageDeletions')).length], [0, 0, 0])
    })))
})
