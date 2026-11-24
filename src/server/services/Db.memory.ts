import { Clock, Effect, Layer } from 'effect'
import { openMemoryD1 } from '../testing/memoryD1'
import { Db, make } from './Db'

/**
 * Test layer: a fresh in-memory SQLite database with every migration in drizzle/ applied (SQL `unixepoch()` reads the Effect clock, so TestClock moves it), behind
 * the same Drizzle D1 driver as production. Node only (node:sqlite); never import from Worker code.
 */
export const memory = Layer.effect(
  Db,
  Effect.acquireRelease(
    Clock.clockWith((clock) => Effect.sync(() => openMemoryD1({ nowMillis: () => clock.currentTimeMillisUnsafe() }))),
    (d1) => Effect.sync(() => d1.close()),
  ).pipe(Effect.map((d1) => make(d1.binding))),
)
