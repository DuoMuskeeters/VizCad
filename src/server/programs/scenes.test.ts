import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import * as schema from '../db/schema'
import { SceneBody } from '../scene'
import { Db } from '../services/Db'
import { defaultPlan, type WorkspaceLimits } from '../services/Entitlements'
import { glb } from '../testing/glb'
import { caller, programLayer, rows, seedDerivative, seedFileGrant, seedMember, seedStoredFile, seedUser, seedWorkspace, T0 } from '../testing/fixtures'
import { purgeFile, trashFile } from './trash'
import { getScene, putScene, SCENE_ACTIVITY_SECONDS } from './scenes'

const run = <A, E, R>(body: Effect.Effect<A, E, R>, limits: WorkspaceLimits = defaultPlan) =>
  TestClock.setTime(T0 * 1000).pipe(Effect.andThen(body), Effect.provide(programLayer(limits, {})))

const STEP = 'ISO-10303-21;\nEND-ISO-10303-21;\n'
const body = (nodes: SceneBody['nodes'] = {}, views: SceneBody['views'] = []): SceneBody => ({ v: 1, nodes, views })
const red = body({ '0.1': { color: '#b23a2e', finish: 'metal', at: 'Pump/Motor' }, '0.2.0': { name: 'Volute', hidden: true, at: 'Pump/Unit/Body' } })

const world = Effect.gen(function* () {
  for (const id of ['bob', 'ada', 'max', 'cat', 'eve', 'zed']) yield* seedUser(id)
  yield* seedWorkspace('acme', 'bob')
  yield* seedMember('acme', 'ada', 'admin')
  yield* seedMember('acme', 'max', 'member')
  yield* seedMember('acme', 'cat', 'commenter')
  yield* seedMember('acme', 'eve', 'guest')
  yield* seedWorkspace('beta', 'zed')
  yield* seedStoredFile('f1', 'bob', 'acme', STEP, { name: 'Pump.step' })
  return yield* seedDerivative('f1', 'acme', glb({ binBytes: 16 }))
})

const update = (id: string, set: Partial<typeof schema.files.$inferInsert>) => Db.use((db) => db.use((d) => d.update(schema.files).set(set).where(eq(schema.files.id, id))))

/** A new version lands: the GLB moves to a snapshot (as `uploads.ts` does), the file gets a new source and GLB. */
const newVersion = (glbKey: string) =>
  Effect.gen(function* () {
    const file = yield* Db.use((db) => db.use((d) => d.select().from(schema.files).where(eq(schema.files.id, 'f1')).get()))
    yield* Db.use((db) => db.use((d) => d.insert(schema.fileVersions).values({
      id: 'v1', fileId: 'f1', versionNumber: 1, r2Key: file!.r2Key, size: file!.size, uploadedByUserId: 'bob', createdAt: new Date(T0 * 1000),
      derivativeR2Key: file!.derivativeR2Key, derivativeState: file!.derivativeState, derivativeMeta: file!.derivativeMeta,
    })))
    yield* update('f1', { r2Key: 'w/acme/f/f1/obj-2', currentVersionNumber: 2, derivativeR2Key: glbKey })
  })

describe('scenes', () => {
  it.effect('reads empty, writes revision 1, then 2; a stale revision is SceneConflict and writes nothing', () =>
    run(Effect.gen(function* () {
      const glbKey = yield* world
      assert.deepStrictEqual(yield* getScene(caller('ada'), { fileId: 'f1' }), { scene: null, previous: null, canEdit: true, maxViews: 20 })
      assert.deepStrictEqual(yield* putScene(caller('ada'), { fileId: 'f1', version: 1, revision: 0, body: red }), { revision: 1, updatedAt: T0 })
      const read = yield* getScene(caller('cat'), { fileId: 'f1' })
      assert.deepStrictEqual(read.scene, { revision: 1, body: red, updatedAt: T0, updatedBy: 'ADA' })
      assert.isFalse(read.canEdit)
      const [row] = yield* rows('fileScenes')
      assert.strictEqual(row?.modelR2Key, glbKey)

      // A second editor who still has revision 0 (both opened an empty scene) conflicts, as does a stale 1 after 2.
      assert.strictEqual((yield* Effect.flip(putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: body() })))._tag, 'SceneConflict')
      assert.deepStrictEqual(yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 1, body: body({ '0': { color: '#ffffff' } }) }), { revision: 2, updatedAt: T0 })
      assert.strictEqual((yield* Effect.flip(putScene(caller('ada'), { fileId: 'f1', version: 1, revision: 1, body: red })))._tag, 'SceneConflict')
      const after = yield* getScene(caller('bob'), { fileId: 'f1' })
      assert.deepStrictEqual([after.scene?.revision, after.scene?.body.nodes, after.scene?.updatedBy], [2, { '0': { color: '#ffffff' } }, 'BOB'])
      assert.lengthOf(yield* rows('fileScenes'), 1)
    })))

  it.effect('read with preview (every level, a guest with view too), write with edit only; strangers see nothing', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* seedFileGrant('f1', 'eve', 'acme', 'view')
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: red })
      assert.strictEqual((yield* getScene(caller('eve'), { fileId: 'f1' })).scene?.revision, 1)
      for (const who of ['cat', 'eve', 'max']) {
        const error = yield* Effect.flip(putScene(caller(who), { fileId: 'f1', version: 1, revision: 1, body: body() }))
        assert.strictEqual(error._tag, 'PermissionDenied', who)
      }
      assert.strictEqual((yield* Effect.flip(getScene(caller('zed'), { fileId: 'f1' })))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* rows('fileScenes'))[0]?.revision, 1)
    })))

  it.effect('a STEP without a GLB has no scene yet; an STL keys its scene on the source', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* update('f1', { derivativeR2Key: null, derivativeState: null, derivativeMeta: null })
      const read = yield* getScene(caller('bob'), { fileId: 'f1' })
      assert.deepStrictEqual([read.scene, read.canEdit], [null, false])
      assert.strictEqual((yield* Effect.flip(putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: red })))._tag, 'PreviewUnavailable')
      yield* seedStoredFile('s1', 'bob', 'acme', 'solid x\nendsolid x\n', { name: 'Part.stl' })
      yield* update('s1', { extension: 'stl' })
      yield* putScene(caller('bob'), { fileId: 's1', version: 1, revision: 0, body: body({ '0': { color: '#2f5f99' } }) })
      const [row] = (yield* rows('fileScenes')).filter((r) => r.fileId === 's1')
      assert.strictEqual(row?.modelR2Key, 'w/acme/f/s1/obj-s1')
    })))

  it.effect('a new version starts empty and offers the previous version\'s record to editors only (§3.3)', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: red })
      yield* newVersion('w/acme/f/f1/glb-2.glb')
      const editor = yield* getScene(caller('ada'), { fileId: 'f1' })
      assert.deepStrictEqual([editor.scene, editor.previous], [null, { body: red, versionNumber: 1 }])
      assert.isNull((yield* getScene(caller('cat'), { fileId: 'f1' })).previous)
      // The editor still on version 1 cannot write onto version 2.
      assert.strictEqual((yield* Effect.flip(putScene(caller('ada'), { fileId: 'f1', version: 1, revision: 1, body: red })))._tag, 'VersionChanged')
      // Applying (or ignoring) writes the new model's own record; the old one stays (its snapshot still exists).
      yield* putScene(caller('ada'), { fileId: 'f1', version: 2, revision: 0, body: body() })
      assert.lengthOf(yield* rows('fileScenes'), 2)
      assert.deepStrictEqual((yield* getScene(caller('ada'), { fileId: 'f1' })).scene?.body, body())
    })))

  it.effect('a record of a model the file no longer has is pruned on the next write; the file\'s purge removes all', () =>
    run(Effect.gen(function* () {
      yield* world
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: red })
      // The GLB is rebuilt (same version, new key): the old record is the matching source until the first write.
      yield* update('f1', { derivativeR2Key: 'w/acme/f/f1/glb-rebuilt.glb' })
      assert.deepStrictEqual((yield* getScene(caller('bob'), { fileId: 'f1' })).previous, { body: red, versionNumber: null })
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: red })
      assert.deepStrictEqual((yield* rows('fileScenes')).map((r) => r.modelR2Key), ['w/acme/f/f1/glb-rebuilt.glb'])
      yield* trashFile(caller('bob'), { workspaceId: 'acme', fileId: 'f1' })
      yield* purgeFile(caller('bob'), { workspaceId: 'acme', fileId: 'f1' })
      assert.lengthOf(yield* rows('fileScenes'), 0)
    })))

  it.effect('limits: saved views per plan, the stored size; activity at most once in ten minutes', () =>
    run(Effect.gen(function* () {
      yield* world
      const view = (id: string) => ({ id, name: id, camera: { position: [1, 2, 3] as const, target: [0, 0, 0] as const, up: [0, 0, 1] as const, fov: 35 } })
      const tooMany = body({}, [view('a'), view('b'), view('c')])
      assert.strictEqual((yield* Effect.flip(putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: tooMany })))._tag, 'ValidationError')
      const huge = body(Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`0.${i}`, { name: 'x'.repeat(100), at: 'y'.repeat(100) }])))
      assert.strictEqual((yield* Effect.flip(putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: huge })))._tag, 'PayloadTooLarge')
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 0, body: body({}, [view('a')]) })
      yield* putScene(caller('bob'), { fileId: 'f1', version: 1, revision: 1, body: red })
      yield* TestClock.adjust((SCENE_ACTIVITY_SECONDS + 1) * 1000)
      yield* putScene(caller('ada'), { fileId: 'f1', version: 1, revision: 2, body: body() })
      const activity = (yield* rows('accessLog')).filter((r) => r.action === 'scene.updated')
      assert.deepStrictEqual(activity.map((r) => [r.actorUserId, r.targetId]), [['bob', 'f1'], ['ada', 'f1']])
    }), { ...defaultPlan, savedViewsPerScene: 2 }))
})

describe('SceneBody schema', () => {
  const decode = (value: unknown) => Schema.decodeUnknownExit(SceneBody)(value, { onExcessProperty: 'error' })
  it('accepts a sparse body and refuses bad paths, colours, finishes, extra fields and too many nodes', () => {
    assert.isTrue(decode(red)._tag === 'Success')
    const bad: unknown[] = [
      { v: 2, nodes: {}, views: [] },
      body({ '1.2': {} }),
      body({ '0.01': {} }),
      { v: 1, nodes: { '0': { color: '#B23A2E' } }, views: [] },
      { v: 1, nodes: { '0': { color: 'red' } }, views: [] },
      { v: 1, nodes: { '0': { finish: 'chrome' } }, views: [] },
      { v: 1, nodes: { '0': { hidden: false } }, views: [] },
      { v: 1, nodes: { '0': { name: '' } }, views: [] },
      { v: 1, nodes: { '0': { owner: 'x' } }, views: [] },
      { v: 1, nodes: {}, views: [], extra: 1 },
      { v: 1, nodes: {}, views: [{ id: 'a', name: 'a', camera: { position: [0, 0, Infinity], target: [0, 0, 0], up: [0, 0, 1], fov: 35 } }] },
      { v: 1, nodes: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`0.${i}`, {}])), views: [] },
    ]
    for (const value of bad) assert.isTrue(decode(value)._tag === 'Failure', JSON.stringify(value).slice(0, 80))
  })
})
