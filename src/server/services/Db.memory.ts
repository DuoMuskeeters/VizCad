import { Effect, Layer } from 'effect'
import { openMemoryD1 } from '../testing/memoryD1'
import { Db, make } from './Db'

/**
 * Test layer: a fresh in-memory SQLite database with every migration in drizzle/ applied, behind
 * the same Drizzle D1 driver as production. Node only (node:sqlite); never import from Worker code.
 */
export const memory = Layer.effect(
  Db,
  Effect.acquireRelease(
    Effect.sync(() => openMemoryD1()),
    (d1) => Effect.sync(() => d1.close()),
  ).pipe(Effect.map((d1) => make(d1.binding))),
)
