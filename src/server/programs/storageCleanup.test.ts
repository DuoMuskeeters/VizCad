import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { caller, programLayer, rows, seedFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { runCron, DAILY, HOURLY } from './cron'
import { drainStorageDeletions, enqueueDeletion, expireUploadSessions, pruneSecurityLog } from './storageCleanup'
import { requestUpload } from './uploads'
import { runBatch } from './shared'
import { AppConfig } from '../services/AppConfig'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer()))

const queue = (...keys: ReadonlyArray<string>) =>
  runBatch((d) => keys.map((key) => enqueueDeletion(d, key, 'purged', T0)))

const world = Effect.gen(function* () {
  yield* seedUser('bob')
  yield* seedWorkspace('acme', 'bob')
})

describe('drainStorageDeletions', () => {
  it.effect('deletes unreferenced keys from R2, then drops their queue rows', () =>
    run(Effect.gen(function* () {
      const storage = yield* Storage
      yield* storage.put('w/acme/f/f1/o1', 'a')
      yield* storage.put('w/acme/f/f1/o2', 'b')
      yield* queue('w/acme/f/f1/o1', 'w/acme/f/f1/o2')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 2, skipped: 0, failed: 0 })
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, [])
      assert.deepStrictEqual(yield* rows('storageDeletions'), [])
    })))

  it.effect('never deletes a key D1 still references (file, thumbnail, version, open session) and drops the row', () =>
    run(Effect.gen(function* () {
      yield* world
      const storage = yield* Storage
      yield* seedFile('f1', 'bob', 'acme') // key users/bob/f1.step
      yield* Db.use((db) => db.use((d) => d.batch([
        d.update(schema.files).set({ thumbnailR2Key: 'thumb/f1' }),
        d.insert(schema.fileVersions).values({ id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'users/bob/old.step', size: 5, uploadedByUserId: 'bob', createdAt: new Date(0), thumbnailR2Key: 'thumb/v1' }),
      ])))
      const ticket = yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'open.stl', size: 134 })
      const open = (yield* rows('uploadSessions'))[0]?.r2Key ?? ''
      const keys = ['users/bob/f1.step', 'thumb/f1', 'users/bob/old.step', 'thumb/v1', open]
      for (const key of keys) yield* storage.put(key, 'x')
      yield* queue(...keys)
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 0, skipped: 5, failed: 0 })
      assert.deepStrictEqual([...(yield* (yield* MemoryStorageControl).keys)].sort(), [...keys].sort())
      assert.deepStrictEqual(yield* rows('storageDeletions'), [])
      assert.isString(ticket.uploadId)
    })))

  it.effect('a key of a completed or rejected session is not protected by the session row', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'gone.stl', size: 134 })
      const [session] = yield* rows('uploadSessions')
      yield* Db.use((db) => db.use((d) => d.update(schema.uploadSessions).set({ status: 'rejected' })))
      yield* (yield* Storage).put(session?.r2Key ?? '', 'x')
      yield* queue(session?.r2Key ?? '')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 1, skipped: 0, failed: 0 })
    })))

  it.effect('never touches blog/ keys', () =>
    run(Effect.gen(function* () {
      const storage = yield* Storage
      yield* storage.put('blog/2026/cover.png', 'img')
      yield* queue('blog/2026/cover.png')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 0, skipped: 1, failed: 0 })
      assert.deepStrictEqual(yield* (yield* MemoryStorageControl).keys, ['blog/2026/cover.png'])
      assert.deepStrictEqual(yield* rows('storageDeletions'), [])
    })))

  it.effect('a failing delete backs off exponentially and keeps the row; it works again once R2 does', () =>
    run(Effect.gen(function* () {
      const storage = yield* Storage
      const control = yield* MemoryStorageControl
      yield* storage.put('w/acme/f/f1/o1', 'a')
      yield* queue('w/acme/f/f1/o1')
      yield* control.failDeletes(true)
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 0, skipped: 0, failed: 1 })
      const [first] = yield* rows('storageDeletions')
      assert.deepStrictEqual([first?.attempts, first?.lastError, first?.notBefore.getTime()], [1, 'StorageError', (T0 + 120) * 1000])
      // Not due yet: nothing happens.
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 0, skipped: 0, failed: 0 })
      yield* TestClock.adjust('121 seconds')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 0, skipped: 0, failed: 1 })
      assert.strictEqual((yield* rows('storageDeletions'))[0]?.notBefore.getTime(), (T0 + 121 + 240) * 1000)
      yield* control.failDeletes(false)
      yield* TestClock.adjust('241 seconds')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 1, skipped: 0, failed: 0 })
      assert.deepStrictEqual(yield* rows('storageDeletions'), [])
    })))

  it.effect('backoff is capped at a day and a limit keeps one run small', () =>
    run(Effect.gen(function* () {
      const control = yield* MemoryStorageControl
      yield* control.failDeletes(true)
      yield* queue('a', 'b', 'c')
      yield* Db.use((db) => db.use((d) => d.update(schema.storageDeletions).set({ attempts: 20 })))
      assert.deepStrictEqual(yield* drainStorageDeletions({ limit: 2 }), { deleted: 0, skipped: 0, failed: 2 })
      const delays = (yield* rows('storageDeletions')).filter((r) => r.attempts === 21).map((r) => r.notBefore.getTime() / 1000 - T0)
      assert.deepStrictEqual(delays, [86400, 86400])
    })))
})

describe('expireUploadSessions', () => {
  it.effect('expires pending sessions an hour past their expiry and queues their keys in the same batch', () =>
    run(Effect.gen(function* () {
      yield* world
      const control = yield* MemoryStorageControl
      yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'a.stl', size: 134 })
      yield* TestClock.adjust('1 hour')
      yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'b.stl', size: 134 })
      const [stale, fresh] = (yield* rows('uploadSessions')).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      yield* (yield* Storage).put(stale?.r2Key ?? '', 'x')
      // a.stl expires at T0 + 600; grace one more hour: not yet at T0 + 3600.
      assert.strictEqual(yield* expireUploadSessions(), 0)
      yield* TestClock.adjust('11 minutes')
      assert.strictEqual(yield* expireUploadSessions(), 1)
      const after = yield* rows('uploadSessions')
      assert.deepStrictEqual(after.map((s) => [s.id === stale?.id, s.status]).sort(), [[false, 'pending'], [true, 'expired']])
      assert.deepStrictEqual((yield* rows('storageDeletions')).map((q) => [q.key, q.reason]), [[stale?.r2Key, 'upload_expired']])
      assert.strictEqual(fresh?.status, 'pending')
      assert.deepStrictEqual(yield* drainStorageDeletions(), { deleted: 1, skipped: 0, failed: 0 })
      assert.deepStrictEqual(yield* control.keys, [])
    })))
})

describe('pruneSecurityLog', () => {
  const entry = (id: string, ageDays: number) => ({
    id, createdAt: new Date((T0 - ageDays * 86400) * 1000), event: 'link_opened' as const, ip: '203.0.113.7', userAgent: 'ua', requestId: 'ray',
  })

  it.effect('deletes rows older than the retention and keeps newer ones, in several rounds', () =>
    run(Effect.gen(function* () {
      yield* Db.use((db) => db.use((d) => d.insert(schema.securityLog).values([entry('new', 1), entry('edge', 89), entry('old', 91), entry('older', 400)])))
      assert.strictEqual(yield* pruneSecurityLog(90), 2)
      assert.deepStrictEqual((yield* rows('securityLog')).map((r) => r.id).sort(), ['edge', 'new'])
      const many = Array.from({ length: 2500 }, (_, i) => entry(`bulk-${i}`, 200))
      for (let at = 0; at < many.length; at += 10) yield* Db.use((db) => db.use((d) => d.insert(schema.securityLog).values(many.slice(at, at + 10))))
      assert.strictEqual(yield* pruneSecurityLog(90), 2500)
      assert.strictEqual((yield* rows('securityLog')).length, 2)
    })))
})

describe('runCron', () => {
  it.effect('hourly runs the expiry and deletion jobs; daily prunes the security log with AppConfig retention', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'a.stl', size: 134 })
      const [session] = yield* rows('uploadSessions')
      yield* (yield* Storage).put(session?.r2Key ?? '', 'x')
      yield* TestClock.adjust('2 hours')
      yield* runCron(HOURLY)
      assert.deepStrictEqual([(yield* rows('uploadSessions'))[0]?.status, (yield* rows('storageDeletions')).length, yield* (yield* MemoryStorageControl).keys], ['expired', 0, []])

      assert.strictEqual((yield* AppConfig).securityLogRetentionDays, 90)
      yield* Db.use((db) => db.use((d) => d.insert(schema.securityLog).values([
        { id: 'old', createdAt: new Date(0), event: 'file_downloaded', requestId: 'r' },
        { id: 'new', createdAt: new Date((T0 + 7200) * 1000), event: 'file_downloaded', requestId: 'r' },
      ])))
      yield* runCron(DAILY)
      assert.deepStrictEqual((yield* rows('securityLog')).map((r) => r.id), ['new'])
      yield* runCron('5 5 5 5 5') // unknown expressions only log
    })))

  it.effect('a failing job does not stop the next one', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* requestUpload(caller('bob'), { workspaceId: 'acme', name: 'a.stl', size: 134 })
      yield* TestClock.adjust('2 hours')
      yield* queue('w/acme/f/x/y')
      yield* (yield* MemoryStorageControl).failDeletes(true)
      yield* runCron(HOURLY)
      assert.strictEqual((yield* rows('uploadSessions'))[0]?.status, 'expired')
    })))
})
