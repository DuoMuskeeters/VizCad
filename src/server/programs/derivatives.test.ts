import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { defaultRateLimits } from '../services/AppConfig'
import { Db } from '../services/Db'
import { defaultPlan, type WorkspaceLimits } from '../services/Entitlements'
import { MemoryStorageControl } from '../services/Storage'
import { glb, glbWith } from '../testing/glb'
import { caller, programLayer, rows, seedFileGrant, seedMember, seedStoredFile, seedUploaderGrant, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { deliverModel } from './delivery'
import { completeDerivative, expireDerivativeSessions, failDerivative, startDerivative } from './derivatives'
import { drainStorageDeletions } from './storageCleanup'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits: WorkspaceLimits = defaultPlan, config = {}) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits, config)))

const STEP = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const STATS = { converter: 'occt-import-js 0.0.23', triangles: 1200, nodes: 4, parts: 3, bbox: { min: [0, 0, 0] as const, max: [10, 20, 5] as const } }

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
  return yield* seedStoredFile('f1', 'bob', 'acme', STEP, { name: 'Bracket.step' })
})

const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flip(effect)
const fileRow = (id = 'f1') => Db.use((db) => db.use((d) => d.select().from(schema.files).where(eq(schema.files.id, id)).get()))
const updateFile = (id: string, set: Partial<typeof schema.files.$inferInsert>) =>
  Db.use((db) => db.use((d) => d.update(schema.files).set(set).where(eq(schema.files.id, id))))
const keys = MemoryStorageControl.use((control) => control.keys)

/** start → browser PUT (as R2 enforces the signed URL) → the ETag the browser saw. */
const upload = (as: string, bytes: Uint8Array, fileId = 'f1', version = 1) =>
  Effect.gen(function* () {
    const ticket = yield* startDerivative(caller(as), { fileId, version, size: bytes.byteLength })
    const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), bytes, ticket.headers)
    assert.strictEqual(put.status, 200)
    return { ticket, etag: put.etag ?? '' }
  })

const complete = (as: string, uploaded: { ticket: { sessionId: string }; etag: string }, fileId = 'f1') =>
  completeDerivative(caller(as), { fileId, sessionId: uploaded.ticket.sessionId, etag: uploaded.etag, stats: STATS })

describe('startDerivative', () => {
  it.effect('signs a size-bound, write-once PUT for a server-made .glb key next to the file and opens a session on the source', () =>
    run(Effect.gen(function* () {
      const source = yield* world
      const ticket = yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 4096 })
      assert.deepStrictEqual(ticket.headers, { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' })
      const [session] = yield* rows('derivativeSessions')
      assert.match(session?.r2Key ?? '', /^w\/acme\/f\/f1\/[0-9A-Z]{26}\.glb$/)
      assert.deepStrictEqual([session?.sourceR2Key, session?.status, session?.declaredSize, session?.userId], [source.key, 'pending', 4096, 'bob'])
      const url = new URL(ticket.url)
      assert.include(decodeURIComponent(url.pathname), session?.r2Key ?? '?')
      // The signature binds the size: a GLB of another length is refused by R2.
      const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(url, new Uint8Array(4095), ticket.headers)
      assert.strictEqual(put.status, 403)
    })),
  )

  it.effect('needs edit: owner, admin and the uploader; a member without edit, a commenter and guests are refused', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedUser('out')
      for (const who of ['bob', 'ada']) assert.isString((yield* startDerivative(caller(who), { fileId: 'f1', version: 1, size: 64 })).sessionId, who)
      assert.strictEqual((yield* failure(startDerivative(caller('max'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'PermissionDenied')
      yield* seedUploaderGrant('f1', 'max', 'acme')
      assert.isString((yield* startDerivative(caller('max'), { fileId: 'f1', version: 1, size: 64 })).sessionId, 'the uploader edits')
      assert.strictEqual((yield* failure(startDerivative(caller('cat'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(startDerivative(caller('eve'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'ResourceUnavailable', 'a guest without a grant learns nothing')
      yield* seedFileGrant('f1', 'eve', 'acme', 'download')
      assert.strictEqual((yield* failure(startDerivative(caller('eve'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'PermissionDenied', 'download is not edit')
      assert.strictEqual((yield* failure(startDerivative(caller('zed'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'WorkspaceUnavailable', 'another workspace')
      assert.strictEqual((yield* failure(startDerivative(caller('out'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'WorkspaceUnavailable')
      yield* updateFile('f1', { isDeleted: true })
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'ResourceUnavailable', 'trashed')
    })),
  )

  it.effect('STEP, IGES and 3MF only; the source within maxConvertBytes and the GLB never over maxFileBytes; the version must be current', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const [extension, ok] of [['stp', true], ['IGES', true], ['igs', true], ['3mf', true], ['stl', false], ['obj', false], ['ply', false]] as const) {
        yield* updateFile('f1', { extension, name: `part.${extension}` })
        const result = yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 }).pipe(Effect.result)
        assert.strictEqual(result._tag === 'Success' ? 'ok' : result.failure._tag, ok ? 'ok' : 'UnsupportedFileType', extension)
      }
      yield* updateFile('f1', { extension: 'step', name: 'part.step' })
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 1001 })))._tag, 'FileTooLarge', 'GLB over maxFileBytes')
      yield* updateFile('f1', { size: 501 })
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'FileTooLarge', 'source over maxConvertBytes')
      yield* updateFile('f1', { size: 500 })
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 2, size: 64 })))._tag, 'VersionChanged')
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 1000 })).sessionId)
    }), { ...defaultPlan, maxConvertBytes: 500, maxFileBytes: 1000 }),
  )

  it.effect('the GLB is capped at a multiple of its source (GLBs are not counted in storage), with a floor for tiny files', () =>
    run(Effect.gen(function* () {
      yield* world
      // Source 1000 bytes: max(floor 2000, 4 × 1000) = 4000.
      yield* updateFile('f1', { size: 1000 })
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 4000 })).sessionId)
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 4001 })))._tag, 'FileTooLarge')
      // Source 100 bytes: the floor.
      yield* updateFile('f1', { size: 100 })
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 2000 })).sessionId)
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 2001 })))._tag, 'FileTooLarge')
    }), { ...defaultPlan, derivativeBytesPerSourceByte: 4, derivativeMinBytes: 2000 }),
  )

  it.effect('complete re-checks the cap against the stored object: an over-size GLB is rejected and deleted', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* updateFile('f1', { size: 10_000 })
      const uploaded = yield* upload('bob', glb({ binBytes: 64 }))
      // The cap dropped between start and complete (the row's size is what the server trusts): HEAD size decides.
      yield* updateFile('f1', { size: 1 })
      assert.strictEqual((yield* failure(complete('bob', uploaded)))._tag, 'FileTooLarge')
      assert.strictEqual((yield* rows('derivativeSessions'))[0]?.status, 'rejected')
      assert.isTrue((yield* keys).every((key) => !key.endsWith('.glb')))
    }), { ...defaultPlan, derivativeBytesPerSourceByte: 1, derivativeMinBytes: 16 }),
  )

  it.effect('a legacy row without a version number counts its snapshots', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* updateFile('f1', { currentVersionNumber: null })
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({ id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'old', size: 1, uploadedByUserId: 'bob', createdAt: new Date(0) })))
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'VersionChanged')
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 2, size: 64 })).sessionId)
    })),
  )

  it.effect('caps open sessions per user', () =>
    run(Effect.gen(function* () {
      yield* world
      for (let i = 0; i < 2; i++) yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'UploadLimitReached')
      assert.isString((yield* startDerivative(caller('ada'), { fileId: 'f1', version: 1, size: 64 })).sessionId, 'per user')
      yield* TestClock.adjust('2 hours')
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })).sessionId, 'expired sessions do not count')
    }), { ...defaultPlan, uploadSessionsPerUser: 2 }),
  )

  it.effect('is rate limited per user (derivativeStart)', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.isString((yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })).sessionId)
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'RateLimitExceeded')
      assert.isString((yield* startDerivative(caller('ada'), { fileId: 'f1', version: 1, size: 64 })).sessionId)
    }), defaultPlan, { rateLimits: { ...defaultRateLimits, derivativeStart: { target: { limit: 1, windowSeconds: 3600 }, ip: { limit: 100, windowSeconds: 3600 } } } }),
  )
})

describe('completeDerivative', () => {
  it.effect('checks the object and points the file at the GLB; the view level then gets it from model as model/gltf-binary', () =>
    run(Effect.gen(function* () {
      yield* world
      const bytes = glb({ binBytes: 64 })
      const uploaded = yield* upload('ada', bytes)
      assert.deepStrictEqual(yield* complete('ada', uploaded), { state: 'ready' })
      const file = yield* fileRow()
      const [session] = yield* rows('derivativeSessions')
      assert.deepStrictEqual([file?.derivativeR2Key, file?.derivativeState, session?.status], [session?.r2Key, 'ready', 'completed'])
      assert.deepStrictEqual(JSON.parse(file?.derivativeMeta ?? '{}'), { v: 1, ...STATS, bbox: { min: [0, 0, 0], max: [10, 20, 5] }, bytes: bytes.byteLength, etag: uploaded.etag.replace(/"/g, '') })
      assert.deepStrictEqual(yield* complete('ada', uploaded), { state: 'ready' }, 'idempotent')

      // D23: a commenter (view/comment level) now opens the GLB; the source stays behind `content`.
      const delivery = yield* deliverModel(caller('cat'), { fileId: 'f1', range: null })
      assert.strictEqual(delivery.status, 200)
      assert.strictEqual(delivery.headers['content-type'], 'model/gltf-binary')
      assert.strictEqual(delivery.headers['content-length'], String(bytes.byteLength))
      assert.include(delivery.headers['content-disposition'] ?? '', 'Bracket.glb')
      const body = new Uint8Array(yield* Effect.promise(() => new Response(delivery.body as BodyInit).arrayBuffer()))
      assert.deepStrictEqual(body, bytes)
      const audit = (yield* rows('accessLog')).filter((r) => r.actorUserId === 'cat')
      assert.deepStrictEqual(audit.map((r) => r.action), ['file.previewed'])
    })),
  )

  it.effect('a corrupt GLB is InvalidDerivative: the session is rejected and the object deleted, the file unchanged', () =>
    run(Effect.gen(function* () {
      yield* world
      for (const [bytes, label] of [[glbWith(0, 0x12345678), 'magic'], [glbWith(4, 1), 'version 1'], [glbWith(16, 0x004e4942), 'BIN first'], [new TextEncoder().encode('{"asset":{"version":"2.0"}}   '), 'plain glTF JSON']] as const) {
        const uploaded = yield* upload('bob', bytes)
        assert.strictEqual((yield* failure(complete('bob', uploaded)))._tag, 'InvalidDerivative', label)
      }
      const header = glb()
      const lying = yield* upload('bob', glbWith(8, header.byteLength + 64, header))
      assert.strictEqual((yield* failure(complete('bob', lying)))._tag, 'InvalidDerivative', 'declared length is not the object size')
      assert.deepStrictEqual((yield* rows('derivativeSessions')).map((s) => s.status), Array(5).fill('rejected'))
      assert.isTrue((yield* keys).every((key) => !key.endsWith('.glb')), 'rejected objects are gone')
      const file = yield* fileRow()
      assert.deepStrictEqual([file?.derivativeR2Key, file?.derivativeState, file?.derivativeMeta], [null, null, null])
    })),
  )

  it.effect('missing object, wrong ETag, other session owner, expired session', () =>
    run(Effect.gen(function* () {
      yield* world
      const ticket = yield* startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: glb().byteLength })
      assert.strictEqual((yield* failure(completeDerivative(caller('bob'), { fileId: 'f1', sessionId: ticket.sessionId, etag: 'x', stats: STATS })))._tag, 'UploadIncomplete')
      yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), glb(), ticket.headers)
      assert.strictEqual((yield* failure(completeDerivative(caller('ada'), { fileId: 'f1', sessionId: ticket.sessionId, etag: 'x', stats: STATS })))._tag, 'UploadUnavailable', 'not ada’s session')
      assert.strictEqual((yield* failure(completeDerivative(caller('bob'), { fileId: 'other', sessionId: ticket.sessionId, etag: 'x', stats: STATS })))._tag, 'UploadUnavailable', 'another file')
      assert.strictEqual((yield* failure(completeDerivative(caller('bob'), { fileId: 'f1', sessionId: ticket.sessionId, etag: '"not-it"', stats: STATS })))._tag, 'UploadMismatch')
      assert.strictEqual((yield* rows('derivativeSessions'))[0]?.status, 'rejected')

      const late = yield* upload('bob', glb())
      yield* TestClock.adjust('2 hours')
      assert.strictEqual((yield* failure(complete('bob', late)))._tag, 'UploadUnavailable')
    })),
  )

  it.effect('version race: a new version landed after start, so the GLB is stale: VersionChanged, the object is queued and deleted', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('bob', glb())
      yield* updateFile('f1', { r2Key: 'w/acme/f/f1/newer', currentVersionNumber: 2 })
      assert.strictEqual((yield* failure(complete('bob', uploaded)))._tag, 'VersionChanged')
      assert.strictEqual((yield* rows('derivativeSessions'))[0]?.status, 'rejected')
      assert.isTrue((yield* keys).every((key) => !key.endsWith('.glb')))
      assert.isNull((yield* fileRow())?.derivativeR2Key ?? null)
      // And a version that moved between start and the browser's PUT is refused at start-time too.
      assert.strictEqual((yield* failure(startDerivative(caller('bob'), { fileId: 'f1', version: 1, size: 64 })))._tag, 'VersionChanged')
    })),
  )

  it.effect('a new derivative replaces the old one: the old key is queued and deleted, unless a version snapshot still holds it', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* complete('bob', yield* upload('bob', glb()))
      const first = (yield* fileRow())?.derivativeR2Key ?? ''
      yield* complete('bob', yield* upload('bob', glb({ binBytes: 16 })))
      const second = (yield* fileRow())?.derivativeR2Key ?? ''
      assert.notStrictEqual(first, second)
      assert.notInclude(yield* keys, first)
      assert.include(yield* keys, second)

      // A snapshot (restore history) holds the second key: replacing it again must not delete it.
      yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({
        id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'w/acme/f/f1/obj-f1', size: 1, uploadedByUserId: 'bob', createdAt: new Date(0), derivativeR2Key: second, derivativeState: 'ready',
      })))
      yield* complete('bob', yield* upload('bob', glb({ binBytes: 32 })))
      assert.include(yield* keys, second)
      assert.strictEqual((yield* rows('storageDeletions')).length, 0, 'the skipped key left the queue')
    })),
  )

  it.effect('a member who lost edit between start and complete cannot complete', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedUploaderGrant('f1', 'max', 'acme')
      const uploaded = yield* upload('max', glb())
      yield* Db.use((db) => db.use((d) => d.delete(schema.fileAccess).where(eq(schema.fileAccess.userId, 'max'))))
      assert.strictEqual((yield* failure(complete('max', uploaded)))._tag, 'PermissionDenied')
      assert.isNull((yield* fileRow())?.derivativeR2Key ?? null)
    })),
  )
})

describe('failDerivative', () => {
  it.effect('records failed with the code or too_large; never over a stored GLB; edit only; the version must be current', () =>
    run(Effect.gen(function* () {
      yield* world
      assert.deepStrictEqual(yield* failDerivative(caller('bob'), { fileId: 'f1', version: 1, code: 'corrupt' }), { state: 'failed' })
      let file = yield* fileRow()
      assert.deepStrictEqual([file?.derivativeState, JSON.parse(file?.derivativeMeta ?? '{}')], ['failed', { v: 1, code: 'corrupt' }])
      yield* failDerivative(caller('ada'), { fileId: 'f1', version: 1, code: 'too_large' })
      assert.strictEqual((yield* fileRow())?.derivativeState, 'too_large')
      assert.strictEqual((yield* failure(failDerivative(caller('cat'), { fileId: 'f1', version: 1, code: 'empty' })))._tag, 'PermissionDenied')
      assert.strictEqual((yield* failure(failDerivative(caller('bob'), { fileId: 'f1', version: 2, code: 'empty' })))._tag, 'VersionChanged')

      // "Yeniden dene": a failed file can still get its derivative, which then wins.
      yield* complete('bob', yield* upload('bob', glb()))
      assert.strictEqual((yield* fileRow())?.derivativeState, 'ready')
      assert.deepStrictEqual(yield* failDerivative(caller('bob'), { fileId: 'f1', version: 1, code: 'timeout' }), { state: 'ready' })
      file = yield* fileRow()
      assert.strictEqual(file?.derivativeState, 'ready')
      assert.strictEqual(JSON.parse(file?.derivativeMeta ?? '{}').triangles, STATS.triangles)
    })),
  )

  it.effect('STL has no derivative to fail', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* updateFile('f1', { extension: 'stl', name: 'part.stl' })
      assert.strictEqual((yield* failure(failDerivative(caller('bob'), { fileId: 'f1', version: 1, code: 'empty' })))._tag, 'UnsupportedFileType')
    })),
  )
})

describe('expireDerivativeSessions', () => {
  it.effect('an hour after expiry: pending sessions expire and their GLB is queued, then the drain deletes it', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('bob', glb())
      const done = yield* upload('ada', glb({ binBytes: 4 }))
      yield* complete('ada', done)
      assert.strictEqual(yield* expireDerivativeSessions(), 0, 'not yet')
      yield* TestClock.adjust('2 hours')
      assert.strictEqual(yield* expireDerivativeSessions(), 1)
      const sessions = yield* rows('derivativeSessions')
      assert.deepStrictEqual(sessions.map((s) => s.status).sort(), ['completed', 'expired'])
      const session = sessions.find((s) => s.status === 'expired')
      assert.deepStrictEqual((yield* rows('storageDeletions')).map((r) => [r.key, r.reason]), [[session?.r2Key, 'upload_expired']])
      yield* drainStorageDeletions()
      assert.notInclude(yield* keys, session?.r2Key ?? '?')
      assert.include(yield* keys, (yield* fileRow())?.derivativeR2Key ?? '?', 'the completed GLB stays')
      void uploaded
    })),
  )

  it.effect('the drain never deletes a GLB a pending session still owns', () =>
    run(Effect.gen(function* () {
      yield* world
      const uploaded = yield* upload('bob', glb())
      const [session] = yield* rows('derivativeSessions')
      yield* Db.use((db) => db.use((d) => d.insert(schema.storageDeletions).values({ key: session?.r2Key ?? '', reason: 'purged', createdAt: new Date(0), attempts: 0, notBefore: new Date(0) })))
      yield* drainStorageDeletions()
      assert.include(yield* keys, session?.r2Key ?? '?')
      assert.deepStrictEqual(yield* complete('bob', uploaded), { state: 'ready' })
    })),
  )
})
