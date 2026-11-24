import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { caller, programLayer, rows, seedFile, seedMember, seedProject, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { cancelUpload, completeUpload, objectKey, requestUpload, uploadTtlSeconds } from './uploads'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits)))

const MB = 1024 * 1024
const enc = new TextEncoder()

/** Valid contents per extension, padded with comment lines to the wanted size. */
const stepBytes = (size: number) => {
  const out = new Uint8Array(size).fill(0x20)
  out.set(enc.encode('ISO-10303-21;\nHEADER;\n'), 0)
  return out
}
const stlBytes = (triangles: number) => {
  const out = new Uint8Array(84 + 50 * triangles)
  new DataView(out.buffer).setUint32(80, triangles, true)
  return out
}
const htmlBytes = enc.encode('<!doctype html><title>x</title><script>alert(1)</script>')

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
})

/** Request, browser PUT (as R2 enforces it) and completion in one go. */
const upload = (by: string, name: string, bytes: Uint8Array, options: { projectId?: string; targetFileId?: string } = {}) =>
  Effect.gen(function* () {
    const control = yield* MemoryStorageControl
    const ticket = yield* requestUpload(caller(by), { workspaceId: 'acme', name, size: bytes.length, ...options })
    const put = yield* control.simulateBrowserPut(new URL(ticket.url), bytes, ticket.headers)
    assert.strictEqual(put.status, 200)
    return { ticket, etag: put.etag ?? '' }
  })

const finish = (by: string, uploaded: { ticket: { uploadId: string }; etag: string }) =>
  completeUpload(caller(by), { uploadId: uploaded.ticket.uploadId, etag: uploaded.etag })

const sessionOf = (uploadId: string) => Db.use((db) => db.use((d) => d.select().from(schema.uploadSessions).where(eq(schema.uploadSessions.id, uploadId)).get()))

describe('objectKey / uploadTtlSeconds', () => {
  it('builds the key from ids only', () => {
    assert.strictEqual(objectKey('ws1', 'f1', 'o1'), 'w/ws1/f/f1/o1')
  })
  it.each([[1, 600], [5_000_000, 600], [300_000_000, 600], [400_000_000, 800], [1_000_000_000, 2000], [5_000_000_000, 3600]])('size %s -> %s s', (size, ttl) => {
    assert.strictEqual(uploadTtlSeconds(size), ttl)
  })
})

describe('requestUpload', () => {
  it.effect('signs a one-shot, size-bound PUT for a server-minted key and reserves the space', () =>
    run(Effect.gen(function* () {
      yield* world
      const ticket = yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'Evil..Name #1?.STEP', size: 5 * MB })
      const url = new URL(ticket.url)
      const [session] = yield* rows('uploadSessions')
      assert.strictEqual(session?.status, 'pending')
      assert.match(session?.r2Key ?? '', /^w\/acme\/f\/[0-9A-Z]{26}\/[0-9A-Z]{26}$/)
      assert.strictEqual(decodeURIComponent(url.pathname), `/${session?.r2Key}`)
      assert.deepStrictEqual(
        [url.searchParams.get('method'), url.searchParams.get('contentLength'), url.searchParams.get('ifNoneMatch'), url.searchParams.get('contentType')],
        ['PUT', String(5 * MB), '*', 'application/octet-stream'],
      )
      assert.notInclude(ticket.url, 'Evil')
      assert.deepStrictEqual(ticket.headers, { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' })
      assert.strictEqual(ticket.expiresAt, T0 + 600)
      assert.deepStrictEqual([session?.extension, session?.declaredSize, session?.targetFileId, session?.userId], ['step', 5 * MB, null, 'max'])
    })))

  it.effect.each([
    { name: 'plan.dwg' }, { name: 'noextension' }, { name: 'archive.zip' }, { name: 'page.html' }, { name: '.stl' },
  ])('refuses $name as an unsupported type', ({ name }) =>
    run(Effect.gen(function* () {
      yield* world
      const error = yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', name, size: 10 }))
      assert.strictEqual(error._tag, 'UnsupportedFileType')
      assert.strictEqual((yield* rows('uploadSessions')).length, 0)
    })))

  it.effect('refuses invalid names and sizes', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const [name, size] of [['', 10], ['a/b.stl', 10], ['a\\b.stl', 10], ['a\nb.stl', 10], ['a.stl', 0], ['a.stl', -5], ['a.stl', 1.5]] as const) {
        assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', name, size })))._tag, 'ValidationError', `${name} ${size}`)
      }
    })))

  it.effect('checks the per-file limit from Entitlements, not a constant', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 1001 })))._tag, 'FileTooLarge')
      yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 1000 })
    }), { ...defaultPlan, maxFileBytes: 1000 }))

  it.effect('writes only for owner, admin and member; others are denied, another workspace is unavailable', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const by of ['bob', 'ada', 'max']) yield* requestUpload(caller(by), { workspaceId: 'acme', name: 'a.stl', size: 100 })
      for (const by of ['cat', 'eve']) {
        assert.strictEqual((yield* Effect.flip(requestUpload(caller(by), { workspaceId: 'acme', name: 'a.stl', size: 100 })))._tag, 'PermissionDenied', by)
      }
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('zed'), { workspaceId: 'acme', name: 'a.stl', size: 100 })))._tag, 'WorkspaceUnavailable')
    })))

  it.effect('a restricted project needs project edit; a team project is open to members', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('open', 'acme', 'bob', 'team')
      yield* seedProject('closed', 'acme', 'bob', 'restricted')
      yield* requestUpload(caller('max'), { workspaceId: 'acme', projectId: 'open', name: 'a.stl', size: 100 })
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', projectId: 'closed', name: 'a.stl', size: 100 })))._tag, 'PermissionDenied')
      yield* requestUpload(caller('ada'), { workspaceId: 'acme', projectId: 'closed', name: 'a.stl', size: 100 })
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', projectId: 'missing', name: 'a.stl', size: 100 })))._tag, 'ResourceUnavailable')
    })))

  it.effect('limits open sessions per user; completing or cancelling frees a slot', () =>
    run(Effect.gen(function* () {
      yield* world
      const tickets = []
      for (let i = 0; i < 3; i++) tickets.push(yield* requestUpload(caller('max'), { workspaceId: 'acme', name: `p${i}.stl`, size: 100 }))
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', name: 'p3.stl', size: 100 })))._tag, 'UploadLimitReached')
      yield* requestUpload(caller('ada'), { workspaceId: 'acme', name: 'other-user.stl', size: 100 })
      yield* cancelUpload(caller('max'), { uploadId: tickets[0]?.uploadId ?? '' })
      yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'p3.stl', size: 100 })
      // Sessions past their expiry stop counting even before the cron expires them.
      yield* TestClock.adjust('11 minutes')
      yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'p4.stl', size: 100 })
    }), { ...defaultPlan, uploadSessionsPerUser: 3 }))

  it.effect('counts open reservations in the quota, and a shared key once', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 600 })
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('ada'), { workspaceId: 'acme', name: 'b.stl', size: 600 })))._tag, 'StorageQuotaExceeded')
      yield* requestUpload(caller('ada'), { workspaceId: 'acme', name: 'b.stl', size: 400 })
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('ada'), { workspaceId: 'acme', name: 'c.stl', size: 1 })))._tag, 'StorageQuotaExceeded')
      // Another workspace has its own quota.
      yield* requestUpload(caller('zed'), { workspaceId: 'beta', name: 'a.stl', size: 1000 })
    }), { ...defaultPlan, storageBytes: 1000 }))

  it.effect('quota counts files and versions by distinct key and size (a restored key is not counted twice)', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('f1', 'bob', 'acme') // size 100, key users/bob/f1.step
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values([
        { id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'users/bob/f1.step', size: 100, uploadedByUserId: 'bob', createdAt: new Date(0) },
        { id: 'v2', fileId: 'f1', versionNumber: 2, r2Key: 'users/bob/old.step', size: 300, uploadedByUserId: 'bob', createdAt: new Date(0) },
      ])))
      // 100 (shared key) + 300 = 400 used.
      yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 600 })
      assert.strictEqual((yield* Effect.flip(requestUpload(caller('max'), { workspaceId: 'acme', name: 'b.stl', size: 1 })))._tag, 'StorageQuotaExceeded')
    }), { ...defaultPlan, storageBytes: 1000 }))

  it.effect('a new version needs edit on the file, a trashed or foreign file is unavailable, the extension must match', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('f1', 'bob', 'acme')
      yield* seedFile('trashed', 'bob', 'acme')
      yield* seedFile('foreign', 'zed', 'beta')
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, 'trashed'))))
      const version = (by: string, targetFileId: string, name = 'new.step') => requestUpload(caller(by), { workspaceId: 'acme', targetFileId, name, size: 100 })
      yield* version('ada', 'f1')
      yield* version('bob', 'f1', 'renamed anything.STEP')
      assert.strictEqual((yield* Effect.flip(version('max', 'f1')))._tag, 'PermissionDenied')
      assert.strictEqual((yield* Effect.flip(version('ada', 'f1', 'new.stl')))._tag, 'VersionTypeMismatch')
      assert.strictEqual((yield* Effect.flip(version('ada', 'trashed')))._tag, 'ResourceUnavailable')
      assert.strictEqual((yield* Effect.flip(version('ada', 'foreign')))._tag, 'ResourceUnavailable')
      assert.strictEqual((yield* Effect.flip(version('ada', 'missing')))._tag, 'ResourceUnavailable')
      const versions = (yield* rows('uploadSessions')).filter((s) => s.targetFileId !== null)
      assert.deepStrictEqual(versions.map((s) => [s.fileId, s.targetFileId]), [['f1', 'f1'], ['f1', 'f1']])
    })))
})

describe('completeUpload: new file', () => {
  it.effect('verifies the object and creates the file, the uploader grant, the audit row and the completed session in one batch', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedProject('open', 'acme', 'bob')
      const uploaded = yield* upload('max', 'Bracket v2.STEP', stepBytes(5 * MB), { projectId: 'open' })
      yield* TestClock.adjust('30 seconds')
      const file = yield* finish('max', uploaded)
      const [row] = yield* rows('files')
      const [session] = yield* rows('uploadSessions')
      const head = Option.getOrThrow(yield* (yield* Storage).head(session?.r2Key ?? ''))
      assert.deepStrictEqual(file, { fileId: row?.id, name: 'Bracket v2.STEP', extension: 'step', size: 5 * MB, versionNumber: 1, isNewVersion: false })
      assert.deepStrictEqual(
        [row?.r2Key, row?.workspaceId, row?.projectId, row?.status, row?.userId, row?.mimeType, row?.contentEtag, row?.currentVersionNumber, row?.currentUploadedByUserId, row?.isDeleted],
        [session?.r2Key, 'acme', 'open', 'uploaded', 'max', 'model/step', head.etag, 1, 'max', false],
      )
      assert.deepStrictEqual([session?.status, session?.completedAt?.getTime()], ['completed', (T0 + 30) * 1000])
      assert.deepStrictEqual((yield* rows('fileAccess')).map((g) => [g.fileId, g.userId, g.level, g.source, g.expiresAt]), [[row?.id ?? '', 'max', 'edit', 'uploader', null]])
      const [audit] = yield* rows('accessLog')
      assert.deepStrictEqual([audit?.action, audit?.targetKind, audit?.targetId, audit?.actorUserId, audit?.outcome], ['file.uploaded', 'file', row?.id, 'max', 'allowed'])
      assert.deepStrictEqual(yield* rows('storageDeletions'), [])
    })))

  it.effect('completion is idempotent: a second call returns the same file and writes nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      const first = yield* finish('max', uploaded)
      const second = yield* finish('max', uploaded)
      assert.deepStrictEqual(second, first)
      assert.strictEqual((yield* rows('files')).length, 1)
      assert.strictEqual((yield* rows('accessLog')).length, 1)
    })))

  it.effect('two concurrent completions of one session create one file and both return it', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      const [a, b] = yield* Effect.all([finish('max', uploaded), finish('max', uploaded)], { concurrency: 2 })
      assert.deepStrictEqual(a, b)
      assert.strictEqual((yield* rows('files')).length, 1)
      assert.strictEqual((yield* rows('fileAccess')).length, 1)
    })))

  it.effect('only the session owner can complete or cancel it', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      assert.strictEqual((yield* Effect.flip(finish('ada', uploaded)))._tag, 'UploadUnavailable')
      assert.strictEqual((yield* Effect.flip(cancelUpload(caller('ada'), { uploadId: uploaded.ticket.uploadId })))._tag, 'UploadUnavailable')
      assert.strictEqual((yield* Effect.flip(completeUpload(caller('max'), { uploadId: 'nope', etag: 'x' })))._tag, 'UploadUnavailable')
      assert.strictEqual((yield* rows('files')).length, 0)
    })))

  it.effect('no object yet is UploadIncomplete and the session stays open for a retry', () =>
    run(Effect.gen(function* () {
      yield* world
      const ticket = yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 134 })
      assert.strictEqual((yield* Effect.flip(completeUpload(caller('max'), { uploadId: ticket.uploadId, etag: 'x' })))._tag, 'UploadIncomplete')
      assert.strictEqual((yield* sessionOf(ticket.uploadId))?.status, 'pending')
      const control = yield* MemoryStorageControl
      const put = yield* control.simulateBrowserPut(new URL(ticket.url), stlBytes(1), ticket.headers)
      yield* completeUpload(caller('max'), { uploadId: ticket.uploadId, etag: put.etag ?? '' })
      assert.strictEqual((yield* rows('files')).length, 1)
    })))

  it.effect('an expired session cannot be completed', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      yield* TestClock.adjust('601 seconds')
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UploadUnavailable')
    })))

  it.effect('permission lost between request and completion stops the upload (object stays for the expiry job)', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      yield* Db.use((db) => db.use((d) => d.update(schema.member).set({ role: 'commenter' }).where(eq(schema.member.userId, 'max'))))
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'PermissionDenied')
      assert.strictEqual((yield* rows('files')).length, 0)
      assert.strictEqual((yield* sessionOf(uploaded.ticket.uploadId))?.status, 'pending')
    })))
})

describe('completeUpload: rejections', () => {
  const rejected = (uploadId: string) =>
    Effect.gen(function* () {
      const session = yield* sessionOf(uploadId)
      return { status: session?.status, files: (yield* rows('files')).length, queue: (yield* rows('storageDeletions')).map((q) => [q.key, q.reason]), key: session?.r2Key }
    })

  it.effect('an HTML page named .stl is rejected, its object queued and deleted (D1 first, then R2)', () =>
    run(Effect.gen(function* () {
      yield* world
      const control = yield* MemoryStorageControl
      const uploaded = yield* upload('max', 'model.stl', htmlBytes)
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UnsupportedFileType')
      const state = yield* rejected(uploaded.ticket.uploadId)
      assert.deepStrictEqual([state.status, state.files], ['rejected', 0])
      // The best-effort deletion ran right after the batch, so the queue row is gone and so is the object.
      assert.deepStrictEqual(state.queue, [])
      assert.deepStrictEqual(yield* control.keys, [])
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UploadUnavailable')
    })))

  it.effect.each([
    { name: 'a.step', bytes: htmlBytes }, { name: 'a.obj', bytes: htmlBytes }, { name: 'a.ply', bytes: htmlBytes },
    { name: 'a.iges', bytes: htmlBytes }, { name: 'a.3mf', bytes: htmlBytes }, { name: 'a.stl', bytes: enc.encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') },
    { name: 'a.step', bytes: stlBytes(2) }, { name: 'a.stl', bytes: stepBytes(500) },
  ])('rejects $name with the wrong content', ({ name, bytes }) =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', name, bytes)
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UnsupportedFileType')
      assert.strictEqual((yield* rows('files')).length, 0)
    })))

  it.effect('a failing R2 delete leaves the queue row for the hourly job', () =>
    run(Effect.gen(function* () {
      yield* world
      const control = yield* MemoryStorageControl
      yield* control.failDeletes(true)
      const uploaded = yield* upload('max', 'model.stl', htmlBytes)
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UnsupportedFileType')
      const state = yield* rejected(uploaded.ticket.uploadId)
      assert.deepStrictEqual(state.queue, [[state.key, 'upload_rejected']])
      assert.deepStrictEqual(yield* control.keys, [state.key ?? ''])
      const [queued] = yield* rows('storageDeletions')
      assert.deepStrictEqual([queued?.attempts, queued?.lastError], [1, 'StorageError'])
    })))

  it.effect('a size that differs from the declared size is a mismatch (R2 would refuse the PUT; the check still holds if it did not)', () =>
    run(Effect.gen(function* () {
      yield* world
      const control = yield* MemoryStorageControl
      const ticket = yield* requestUpload(caller('max'), { workspaceId: 'acme', name: 'a.stl', size: 134 })
      const refused = yield* control.simulateBrowserPut(new URL(ticket.url), stlBytes(2).subarray(0, 150), ticket.headers)
      assert.strictEqual(refused.status, 403)
      assert.deepStrictEqual(yield* control.keys, [])
      // An object of another size that got in through some other path (an unsigned write) is still caught.
      const session = yield* sessionOf(ticket.uploadId)
      const stored = yield* (yield* Storage).put(session?.r2Key ?? '', stlBytes(2))
      assert.strictEqual((yield* Effect.flip(completeUpload(caller('max'), { uploadId: ticket.uploadId, etag: stored.etag })))._tag, 'UploadMismatch')
      assert.strictEqual((yield* sessionOf(ticket.uploadId))?.status, 'rejected')
      assert.deepStrictEqual(yield* control.keys, [])
      assert.strictEqual((yield* rows('files')).length, 0)
    })))

  it.effect('an ETag that differs from the stored object is a mismatch', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      const error = yield* Effect.flip(completeUpload(caller('max'), { uploadId: uploaded.ticket.uploadId, etag: '"0123456789abcdef0123456789abcdef"' }))
      assert.strictEqual(error._tag, 'UploadMismatch')
      assert.strictEqual((yield* sessionOf(uploaded.ticket.uploadId))?.status, 'rejected')
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, [])
    })))

  it.effect('a second PUT to the same key is refused by R2 (412) and cannot swap the content after completion', () =>
    run(Effect.gen(function* () {
      yield* world
      const control = yield* MemoryStorageControl
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      const again = yield* control.simulateBrowserPut(new URL(uploaded.ticket.url), stlBytes(3).fill(1, 0, 10), uploaded.ticket.headers)
      assert.strictEqual(again.status, 412)
      const file = yield* finish('max', uploaded)
      const afterwards = yield* control.simulateBrowserPut(new URL(uploaded.ticket.url), stlBytes(3), uploaded.ticket.headers)
      assert.strictEqual(afterwards.status, 412)
      assert.strictEqual(file.size, 84 + 150)
    })))

  it.effect('the quota is rechecked at completion: space taken in between rejects the object and queues it', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3)) // 234 bytes reserved
      // Another write path used the space after the reservation was made (e.g. a restore or a legacy upload).
      yield* seedFile('big', 'bob', 'acme') // 100 bytes
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ size: 800 }).where(eq(schema.files.id, 'big'))))
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'StorageQuotaExceeded')
      assert.strictEqual((yield* sessionOf(uploaded.ticket.uploadId))?.status, 'rejected')
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, [])
      assert.strictEqual((yield* rows('files')).length, 1)
    }), { ...defaultPlan, storageBytes: 1000 }))

  it.effect('race: two sessions that each fit alone but not together are not both completed', () =>
    run(Effect.gen(function* () {
      yield* world
      const a = yield* upload('max', 'a.stl', stlBytes(3)) // 234
      const b = yield* upload('ada', 'b.stl', stlBytes(3)) // 234 (reservations 468 <= 500)
      yield* seedFile('big', 'bob', 'acme')
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ size: 200 }).where(eq(schema.files.id, 'big'))))
      // Committed 200 + other reservation 234 + 234 = 668 > 500 for both; neither may exceed the quota.
      const results = yield* Effect.all([Effect.result(finish('max', a)), Effect.result(finish('ada', b))], { concurrency: 2 })
      const stored = (yield* rows('files')).reduce((sum, f) => sum + f.size, 0)
      assert.isAtMost(stored, 500)
      assert.isAtMost(results.filter((r) => r._tag === 'Success').length, 1)
      assert.isAtMost((yield* rows('files')).length, 2) // 'big' plus at most one new file
    }), { ...defaultPlan, storageBytes: 500 }))
})

describe('completeUpload: new version', () => {
  it.effect('snapshots the current version, moves the file to the new key and numbers versions', () =>
    run(Effect.gen(function* () {
      yield* world
      const first = yield* finish('max', yield* upload('max', 'Part.step', stepBytes(300)))
      const [v1Row] = yield* rows('files')
      const v1Key = v1Row?.r2Key
      yield* TestClock.adjust('1 minute')
      const second = yield* finish('ada', yield* upload('ada', 'ignored name.step', stepBytes(400), { targetFileId: first.fileId }))
      assert.deepStrictEqual(second, { fileId: first.fileId, name: 'Part.step', extension: 'step', size: 400, versionNumber: 2, isNewVersion: true })
      yield* finish('max', yield* upload('max', 'again.STEP', stepBytes(500), { targetFileId: first.fileId }))

      const [file] = yield* rows('files')
      const versions = (yield* rows('fileVersions')).sort((a, b) => a.versionNumber - b.versionNumber)
      assert.deepStrictEqual([file?.currentVersionNumber, file?.size, file?.name, file?.currentUploadedByUserId, file?.thumbnailR2Key], [3, 500, 'Part.step', 'max', null])
      assert.deepStrictEqual(versions.map((v) => [v.versionNumber, v.size, v.uploadedByUserId]), [[1, 300, 'max'], [2, 400, 'ada']])
      assert.strictEqual(versions[0]?.r2Key, v1Key)
      assert.notStrictEqual(file?.r2Key, versions[1]?.r2Key)
      assert.strictEqual(versions[0]?.contentEtag, v1Row?.contentEtag)
      assert.deepStrictEqual((yield* rows('accessLog')).map((a) => a.action), ['file.uploaded', 'file.version_uploaded', 'file.version_uploaded'])
      assert.strictEqual((yield* rows('fileAccess')).length, 1) // no new grant for a version
      assert.deepStrictEqual(yield* rows('storageDeletions'), []) // old objects stay: they are versions
    })))

  it.effect('a legacy file (NULL version number and ETag) becomes COUNT + 1 and keeps its old object as a version', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFile('legacy', 'bob', 'acme') // size 100, key users/bob/legacy.step, no new columns
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({ id: 'lv', fileId: 'legacy', versionNumber: 1, r2Key: 'users/bob/legacy-v1.step', size: 90, uploadedByUserId: 'bob', createdAt: new Date(0) })))
      const result = yield* finish('ada', yield* upload('ada', 'x.step', stepBytes(200), { targetFileId: 'legacy' }))
      assert.strictEqual(result.versionNumber, 3)
      const versions = (yield* rows('fileVersions')).sort((a, b) => a.versionNumber - b.versionNumber)
      assert.deepStrictEqual(versions.map((v) => [v.versionNumber, v.r2Key, v.uploadedByUserId, v.contentEtag]), [[1, 'users/bob/legacy-v1.step', 'bob', null], [2, 'users/bob/legacy.step', 'bob', null]])
      const [file] = yield* rows('files')
      assert.deepStrictEqual([file?.currentVersionNumber, file?.size, file?.contentEtag === null], [3, 200, false])
    })))

  it.effect('version race: the second of two concurrent completions never reuses a number; a retry succeeds', () =>
    run(Effect.gen(function* () {
      yield* world
      const base = yield* finish('max', yield* upload('max', 'Part.step', stepBytes(300)))
      const a = yield* upload('ada', 'a.step', stepBytes(310), { targetFileId: base.fileId })
      const b = yield* upload('max', 'b.step', stepBytes(320), { targetFileId: base.fileId })
      const results = yield* Effect.all([Effect.result(finish('ada', a)), Effect.result(finish('max', b))], { concurrency: 2 })
      // Both read the same current version; the batch guard lets exactly one through.
      assert.deepStrictEqual(results.map((r) => (r._tag === 'Failure' ? r.failure._tag : 'ok')).sort(), ['WriteConflict', 'ok'])
      // Whoever lost can simply complete again.
      yield* Effect.all([finish('ada', a), finish('max', b)], { concurrency: 1 })
      const numbers = (yield* rows('fileVersions')).map((v) => v.versionNumber).sort()
      assert.deepStrictEqual(numbers, [1, 2]) // snapshots of v1 and v2; v3 is the current one
      const [file] = yield* rows('files')
      assert.strictEqual(file?.currentVersionNumber, 3)
    })))

  it.effect('a file trashed after the request cannot receive the version', () =>
    run(Effect.gen(function* () {
      yield* world
      const base = yield* finish('max', yield* upload('max', 'Part.step', stepBytes(300)))
      const uploaded = yield* upload('max', 'v.step', stepBytes(310), { targetFileId: base.fileId })
      yield* Db.use((db) => db.use((d) => d.update(schema.files).set({ isDeleted: true }).where(eq(schema.files.id, base.fileId))))
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'ResourceUnavailable')
      assert.strictEqual((yield* rows('fileVersions')).length, 0)
    })))
})

describe('cancelUpload', () => {
  it.effect('releases the reservation and queues the object (deleted right away)', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      yield* cancelUpload(caller('max'), { uploadId: uploaded.ticket.uploadId })
      assert.strictEqual((yield* sessionOf(uploaded.ticket.uploadId))?.status, 'expired')
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, [])
      assert.strictEqual((yield* Effect.flip(cancelUpload(caller('max'), { uploadId: uploaded.ticket.uploadId })))._tag, 'UploadUnavailable')
      assert.strictEqual((yield* Effect.flip(finish('max', uploaded)))._tag, 'UploadUnavailable')
    })))

  it.effect('a completed session cannot be cancelled', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('max', 'a.stl', stlBytes(3))
      yield* finish('max', uploaded)
      assert.strictEqual((yield* Effect.flip(cancelUpload(caller('max'), { uploadId: uploaded.ticket.uploadId })))._tag, 'UploadUnavailable')
      assert.strictEqual((yield* rows('files')).length, 1)
    })))
})
