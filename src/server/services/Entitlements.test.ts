import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import * as schema from '../db/schema'
import { seedUser, seedWorkspace } from '../testing/fixtures'
import * as DbMemory from './Db.memory'
import { Db } from './Db'
import { defaultPlan, Entitlements, live } from './Entitlements'

const MB = 1024 * 1024
const GB = 1024 * MB

describe('defaultPlan (D21)', () => {
  it('holds the Faz 4 plan values', () => {
    assert.deepStrictEqual(
      {
        maxFileBytes: defaultPlan.maxFileBytes, storageBytes: defaultPlan.storageBytes, trashRetentionDays: defaultPlan.trashRetentionDays,
        activeShareLinks: defaultPlan.activeShareLinks, linkMaxLifetimeSeconds: defaultPlan.linkMaxLifetimeSeconds,
        auditRetentionDays: defaultPlan.auditRetentionDays, uploadSessionsPerUser: defaultPlan.uploadSessionsPerUser,
      },
      { maxFileBytes: 100 * MB, storageBytes: 5 * GB, trashRetentionDays: 30, activeShareLinks: null, linkMaxLifetimeSeconds: null, auditRetentionDays: 365, uploadSessionsPerUser: 20 },
    )
  })
})

describe('Entitlements.live', () => {
  const layer = live.pipe(Layer.provideMerge(DbMemory.memory))
  const limitsOf = (workspaceId: string) => Entitlements.use((e) => e.limits(workspaceId))

  it.effect('a company workspace is on the default plan', () =>
    Effect.gen(function* () {
      yield* seedUser('bob')
      yield* seedWorkspace('acme', 'bob')
      assert.deepStrictEqual(yield* limitsOf('acme'), defaultPlan)
      assert.deepStrictEqual(yield* limitsOf('unknown'), defaultPlan)
    }).pipe(Effect.provide(layer)))

  it.effect('a personal workspace keeps the larger of the plan and the owner\'s legacy quota', () =>
    Effect.gen(function* () {
      yield* seedUser('ada')
      yield* seedUser('lin')
      yield* seedUser('sam')
      yield* seedWorkspace('p-ada', 'ada', 'personal')
      yield* seedWorkspace('p-lin', 'lin', 'personal')
      yield* seedWorkspace('p-sam', 'sam', 'personal')
      yield* Db.use((db) => db.use((d) => d.batch([
        d.update(schema.user).set({ storageQuotaGb: 20 }).where(eq(schema.user.id, 'ada')),
        d.update(schema.user).set({ storageQuotaGb: 1 }).where(eq(schema.user.id, 'lin')),
      ])))
      assert.strictEqual((yield* limitsOf('p-ada')).storageBytes, 20 * GB)
      assert.strictEqual((yield* limitsOf('p-lin')).storageBytes, 5 * GB)
      assert.strictEqual((yield* limitsOf('p-sam')).storageBytes, 5 * GB) // default quota 5
      assert.deepStrictEqual({ ...(yield* limitsOf('p-ada')), storageBytes: 0 }, { ...defaultPlan, storageBytes: 0 })
    }).pipe(Effect.provide(layer)))
})
