/** Race helpers for program tests: another request landing at an exact point of a call. Tests only. */
import { Effect } from 'effect'
import { type Database, Db } from '../services/Db'

/**
 * A Db whose first `batch` first runs `interfere` to the end (against the real Db): the other request lands exactly
 * between the call's reads and its write.
 */
export const beforeFirstBatch = <E, R>(interfere: Effect.Effect<unknown, E, R>) =>
  Effect.gen(function* () {
    const real = yield* Db
    const context = yield* Effect.context<R | Db>()
    let fired = false
    const hook = (d: Database): Database =>
      new Proxy(d, {
        get: (target, prop, receiver) => {
          if (prop !== 'batch' || fired) return Reflect.get(target, prop, receiver)
          const batch: Database['batch'] = async (statements) => {
            fired = true
            await Effect.runPromise(interfere.pipe(Effect.provide(context)))
            return target.batch(statements)
          }
          return batch
        },
      })
    return Db.of({ use: (query) => real.use((d) => query(hook(d))) })
  })
