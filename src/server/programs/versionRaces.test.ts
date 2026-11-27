/**
 * Interleavings of a new version (completeUpload) or a restore (restoreVersion) with a GLB derivative or a thumbnail that
 * lands while the call is between its reads and its batch (docs/11 Faz 5b review). Whatever the order, every object in
 * the bucket is referenced by a row or queued for deletion, and every key a row holds still exists.
 */
import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan } from '../services/Entitlements'
import { MemoryStorageControl, Storage } from '../services/Storage'
import { glb } from '../testing/glb'
import { png } from '../testing/images'
import { caller, programLayer, rows, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { beforeFirstBatch } from '../testing/races'
import { putThumbnail } from './delivery'
import { completeDerivative, startDerivative } from './derivatives'
import { drainStorageDeletions } from './storageCleanup'
import { completeUpload, requestUpload } from './uploads'
import { restoreVersion } from './versions'

const run = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(defaultPlan)))

const STEP = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const STATS = { converter: 'test', triangles: 1, nodes: 1, parts: 1, bbox: { min: [0, 0, 0] as const, max: [1, 1, 1] as const } }
const fileRow = Db.use((db) => db.use((d) => d.select().from(schema.files).where(eq(schema.files.id, 'f1')).get()))

/** start → browser PUT of a GLB for version `version`; completing it is left to the test. */
const pendingDerivative = (bytes: Uint8Array, version: number) =>
  Effect.gen(function* () {
    const ticket = yield* startDerivative(caller('bob'), { fileId: 'f1', version, size: bytes.byteLength })
    const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), bytes, ticket.headers)
    return { fileId: 'f1', sessionId: ticket.sessionId, etag: put.etag ?? '', stats: STATS }
  })

const deriveNow = (bytes: Uint8Array, version: number) =>
  pendingDerivative(bytes, version).pipe(Effect.flatMap((pending) => completeDerivative(caller('bob'), pending)))

/** A new version of f1, uploaded and PUT; `complete` finishes it. */
const pendingVersion = Effect.gen(function* () {
  const bytes = new TextEncoder().encode(`${STEP} `)
  const ticket = yield* requestUpload(caller('bob'), { workspaceId: 'acme', targetFileId: 'f1', name: 'Bracket.step', size: bytes.byteLength })
  const put = yield* (yield* MemoryStorageControl).simulateBrowserPut(new URL(ticket.url), bytes, ticket.headers)
  return { complete: completeUpload(caller('bob'), { uploadId: ticket.uploadId, etag: put.etag ?? '' }) }
})

/** f1 on version 2 with an older snapshot v1 (its own object, no thumbnail or GLB) to restore. */
const withOlderVersion = Effect.gen(function* () {
  const old = yield* (yield* Storage).put('w/acme/f/f1/old', STEP)
  yield* Db.use((db) => db.use((d) => d.batch([
    d.update(schema.files).set({ currentVersionNumber: 2 }).where(eq(schema.files.id, 'f1')),
    d.insert(schema.fileVersions).values({
      id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: 'w/acme/f/f1/old', size: old.size, contentEtag: old.etag, uploadedByUserId: 'bob', createdAt: new Date(0),
    }),
  ])))
})

/** After the queue drained: objects nobody references and nobody queued, and keys rows hold that are gone. */
const audit = Effect.gen(function* () {
  yield* TestClock.adjust('3 hours')
  yield* drainStorageDeletions()
  const stored = (yield* MemoryStorageControl.use((c) => c.keys)).filter((k) => k.endsWith('.glb') || k.endsWith('.thumb'))
  const files = yield* rows('files')
  const versions = yield* rows('fileVersions')
  const sessions = (yield* rows('derivativeSessions')).filter((s) => s.status === 'pending')
  const queued = (yield* rows('storageDeletions')).map((r) => r.key)
  const held = [...files, ...versions].flatMap((r) => [r.thumbnailR2Key, r.derivativeR2Key]).filter((k) => k !== null)
  return {
    orphans: stored.filter((k) => !held.includes(k) && !queued.includes(k) && !sessions.some((s) => s.r2Key === k)),
    dangling: held.filter((k) => !stored.includes(k)),
  }
})

const snapshotOf = (number: number) => rows('fileVersions').pipe(Effect.map((all) => all.find((v) => v.versionNumber === number)))

const world = Effect.gen(function* () {
  yield* seedUser('bob')
  yield* seedWorkspace('acme', 'bob')
  yield* seedStoredFile('f1', 'bob', 'acme', STEP, { name: 'Bracket.step' })
})

describe('a derivative that completes while a new version is being written', () => {
  for (const prior of [false, true]) {
    it.effect(`${prior ? 'replacing GLB A' : 'with no prior GLB'}: the snapshot holds the new GLB, nothing is orphaned or dangling`, () =>
      run(Effect.gen(function* () {
        yield* world
        if (prior) yield* deriveNow(glb(), 1)
        const before = (yield* fileRow)?.derivativeR2Key ?? null
        const pending = yield* pendingDerivative(glb({ binBytes: 16 }), 1)
        const next = yield* pendingVersion
        yield* next.complete.pipe(Effect.provideService(Db, yield* beforeFirstBatch(completeDerivative(caller('bob'), pending))))

        const session = (yield* rows('derivativeSessions')).find((s) => s.id === pending.sessionId)
        assert.strictEqual(session?.status, 'completed', 'the derivative landed first')
        const snapshot = yield* snapshotOf(1)
        assert.strictEqual(snapshot?.derivativeR2Key, session?.r2Key, 'the snapshot holds the GLB that landed, not the one read before')
        assert.strictEqual(snapshot?.derivativeState, 'ready')
        assert.isNull((yield* fileRow)?.derivativeR2Key ?? null, 'the new version has none yet')
        const { orphans, dangling } = yield* audit
        assert.deepStrictEqual([orphans, dangling], [[], []])
        if (before !== null) assert.notInclude(yield* MemoryStorageControl.use((c) => c.keys), before, 'GLB A was replaced and deleted')
      })))
  }

  it.effect('a derivative that completes after the new version is stale: VersionChanged, its object is deleted', () =>
    run(Effect.gen(function* () {
      yield* world
      const pending = yield* pendingDerivative(glb(), 1)
      yield* (yield* pendingVersion).complete
      assert.strictEqual((yield* Effect.flip(completeDerivative(caller('bob'), pending)))._tag, 'VersionChanged')
      const { orphans, dangling } = yield* audit
      assert.deepStrictEqual([orphans, dangling], [[], []])
      assert.isTrue((yield* MemoryStorageControl.use((c) => c.keys)).every((k) => !k.endsWith('.glb')))
    })))
})

describe('a derivative that completes while a restore is being written', () => {
  for (const prior of [false, true]) {
    it.effect(`${prior ? 'replacing GLB A' : 'with no prior GLB'}: the snapshot holds the new GLB, nothing is orphaned or dangling`, () =>
      run(Effect.gen(function* () {
        yield* world
        yield* withOlderVersion
        if (prior) yield* deriveNow(glb(), 2)
        const before = (yield* fileRow)?.derivativeR2Key ?? null
        const pending = yield* pendingDerivative(glb({ binBytes: 16 }), 2)
        yield* restoreVersion(caller('bob'), { workspaceId: 'acme', fileId: 'f1', versionId: 'v1' }).pipe(
          Effect.provideService(Db, yield* beforeFirstBatch(completeDerivative(caller('bob'), pending))),
        )

        const session = (yield* rows('derivativeSessions')).find((s) => s.id === pending.sessionId)
        assert.strictEqual(session?.status, 'completed')
        const snapshot = yield* snapshotOf(2)
        assert.strictEqual(snapshot?.derivativeR2Key, session?.r2Key)
        assert.deepStrictEqual([(yield* fileRow)?.r2Key, (yield* fileRow)?.derivativeR2Key ?? null], ['w/acme/f/f1/old', null], 'v1 is current, with its own (no) GLB')
        const { orphans, dangling } = yield* audit
        assert.deepStrictEqual([orphans, dangling], [[], []])
        if (before !== null) assert.notInclude(yield* MemoryStorageControl.use((c) => c.keys), before)
      })))
  }
  it.effect('restoring a snapshot of the current source while its new GLB lands: the file holds the new GLB, nothing dangles', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* withOlderVersion
      const source = (yield* fileRow)?.r2Key ?? ''
      yield* deriveNow(glb(), 2)
      const k1 = (yield* fileRow)?.derivativeR2Key ?? null
      // v1 becomes current, leaving a snapshot S of the source with GLB K1; restoring S makes the source current again.
      yield* restoreVersion(caller('bob'), { workspaceId: 'acme', fileId: 'f1', versionId: 'v1' })
      const s = (yield* rows('fileVersions')).find((v) => v.r2Key === source && v.derivativeR2Key === k1)
      if (s === undefined) return assert.fail('no snapshot of the source with K1')
      yield* restoreVersion(caller('bob'), { workspaceId: 'acme', fileId: 'f1', versionId: s.id })

      const pending = yield* pendingDerivative(glb({ binBytes: 16 }), (yield* fileRow)?.currentVersionNumber ?? 0)
      yield* restoreVersion(caller('bob'), { workspaceId: 'acme', fileId: 'f1', versionId: s.id }).pipe(
        Effect.provideService(Db, yield* beforeFirstBatch(completeDerivative(caller('bob'), pending))),
      )

      const session = (yield* rows('derivativeSessions')).find((x) => x.id === pending.sessionId)
      assert.strictEqual(session?.status, 'completed')
      assert.strictEqual((yield* fileRow)?.derivativeR2Key, session?.r2Key, 'the restore wrote the GLB that landed, not K1')
      const { orphans, dangling } = yield* audit
      assert.deepStrictEqual([orphans, dangling], [[], []])
    })))
})

describe('restoring and deriving the same sources again and again', () => {
  it.effect('keeps at most one GLB per source object; every GLB is referenced or queued', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* withOlderVersion
      const current = yield* fileRow
      const sources = ['w/acme/f/f1/old', current?.r2Key ?? '']
      for (let round = 0; round < 3; round++) {
        for (const source of sources) {
          // The newest snapshot of that source object becomes current, then gets a fresh GLB.
          const snapshot = (yield* rows('fileVersions')).filter((v) => v.r2Key === source).sort((a, b) => b.versionNumber - a.versionNumber)[0]
          if (snapshot === undefined) return assert.fail(`no snapshot of ${source}`)
          if ((yield* fileRow)?.r2Key !== source) yield* restoreVersion(caller('bob'), { workspaceId: 'acme', fileId: 'f1', versionId: snapshot.id })
          yield* deriveNow(glb({ binBytes: 16 * (round + 1) }), (yield* fileRow)?.currentVersionNumber ?? 0)

          const { orphans, dangling } = yield* audit
          assert.deepStrictEqual([orphans, dangling], [[], []], `round ${round}, ${source}`)
          const held = [...(yield* rows('files')), ...(yield* rows('fileVersions'))].filter((r) => r.derivativeR2Key !== null)
          for (const key of sources) {
            const glbs = new Set(held.filter((r) => r.r2Key === key).map((r) => r.derivativeR2Key))
            assert.isAtMost(glbs.size, 1, `one GLB for ${key} (round ${round})`)
          }
          const stored = (yield* MemoryStorageControl.use((c) => c.keys)).filter((k) => k.endsWith('.glb'))
          assert.isAtMost(stored.length, sources.length, `round ${round}: ${stored.length} GLBs in R2`)
        }
      }
    })))
})

describe('a thumbnail that lands while a new version or another thumbnail is being written', () => {
  it.effect('new version: the snapshot holds the thumbnail that landed, the replaced one is deleted', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* putThumbnail(caller('bob'), { fileId: 'f1', version: 'current', expectedVersion: 1, contentType: 'image/png', bytes: png() })
      const first = (yield* fileRow)?.thumbnailR2Key ?? null
      const next = yield* pendingVersion
      const interfere = putThumbnail(caller('bob'), { fileId: 'f1', version: 'current', expectedVersion: 1, contentType: 'image/png', bytes: png(8, 8) })
      yield* next.complete.pipe(Effect.provideService(Db, yield* beforeFirstBatch(interfere)))
      const snapshot = yield* snapshotOf(1)
      assert.isString(snapshot?.thumbnailR2Key)
      assert.notStrictEqual(snapshot?.thumbnailR2Key, first)
      const { orphans, dangling } = yield* audit
      assert.deepStrictEqual([orphans, dangling], [[], []])
      assert.notInclude(yield* MemoryStorageControl.use((c) => c.keys), first)
    })))

  it.effect('two thumbnails at once: the replaced key is the one the file held at write time', () =>
    run(Effect.gen(function* () {
      yield* world
      const put = (size: number) => putThumbnail(caller('bob'), { fileId: 'f1', version: 'current', expectedVersion: 1, contentType: 'image/png', bytes: png(size, size) })
      yield* put(4)
      yield* put(6).pipe(Effect.provideService(Db, yield* beforeFirstBatch(put(8))))
      const { orphans, dangling } = yield* audit
      assert.deepStrictEqual([orphans, dangling], [[], []])
      assert.strictEqual((yield* MemoryStorageControl.use((c) => c.keys)).filter((k) => k.endsWith('.thumb')).length, 1)
    })))

  it.effect('a thumbnail whose batch fails (the version moved) is queued and deleted, not left behind', () =>
    run(Effect.gen(function* () {
      yield* world
      const stale = putThumbnail(caller('bob'), { fileId: 'f1', version: 'current', expectedVersion: 1, contentType: 'image/png', bytes: png() })
      const next = yield* pendingVersion
      // R2 refuses the immediate delete: only the queue row can bring the object back to the cron.
      const control = yield* MemoryStorageControl
      yield* control.failDeletes(true)
      const failed = yield* Effect.flip(stale.pipe(Effect.provideService(Db, yield* beforeFirstBatch(next.complete))))
      assert.strictEqual(failed._tag, 'WriteConflict')
      const thumbs = (yield* control.keys).filter((k) => k.endsWith('.thumb'))
      assert.strictEqual(thumbs.length, 1, 'the delete failed, the object is still there')
      assert.include((yield* rows('storageDeletions')).map((r) => r.key), thumbs[0], 'and it is queued')
      yield* control.failDeletes(false)
      const { orphans, dangling } = yield* audit
      assert.deepStrictEqual([orphans, dangling], [[], []])
      assert.isTrue((yield* MemoryStorageControl.use((c) => c.keys)).every((k) => !k.endsWith('.thumb')))
    })))
})
