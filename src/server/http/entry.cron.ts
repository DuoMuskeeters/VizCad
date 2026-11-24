import { Effect, Layer } from 'effect'
import { runCron } from '../programs/cron'
import { liveLayers } from '../services/live'

/** Cron triggers (`scheduled` in src/server.ts): hourly upload/deletion cleanup, daily trash purge and security-log pruning. */
export const handleScheduled = (cron: string, env: Cloudflare.Env): Promise<void> => {
  const live = liveLayers(env)
  return Effect.runPromise(runCron(cron).pipe(Effect.provide(Layer.mergeAll(live.db, live.storage, live.config, live.entitlements))))
}
