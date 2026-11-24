import { Effect } from 'effect'
import { AppConfig } from '../services/AppConfig'
import { pruneAccessLog } from './accessLogCleanup'
import { drainStorageDeletions, expireUploadSessions, pruneSecurityLog } from './storageCleanup'
import { purgeExpiredTrash } from './trash'

/** Must match `triggers.crons` in wrangler.jsonc (top level; `env.production` overrides it with an empty list before the cutover). */
export const HOURLY = '0 * * * *'
export const DAILY = '30 3 * * *'

/** Runs one job; a failing job is logged with its name and tag only and never stops the next one. */
const job = <A, E extends { readonly _tag: string }, R>(name: string, run: Effect.Effect<A, E, R>) =>
  run.pipe(
    Effect.tap((summary) => Effect.logInfo('cron job done').pipe(Effect.annotateLogs({ job: name, summary: JSON.stringify(summary) }))),
    Effect.catch((error) => Effect.logError('cron job failed').pipe(Effect.annotateLogs({ job: name, error: error._tag }))),
  )

/**
 * The scheduled work for one cron expression (docs/09 §9.2). Hourly: expire abandoned upload sessions, then drain the R2
 * deletion queue. Daily: purge trash past its retention (D21: 30 days; this runs as the system and queues
 * the R2 keys for the next hourly drain), then prune the access log (per workspace `Entitlements.auditRetentionDays`, 365 by default) and the security log (D21, 90 days).
 */
export const runCron = (cron: string) =>
  Effect.gen(function* () {
    if (cron === HOURLY) {
      yield* job('expireUploadSessions', expireUploadSessions())
      yield* job('drainStorageDeletions', drainStorageDeletions())
    } else if (cron === DAILY) {
      const { securityLogRetentionDays } = yield* AppConfig
      yield* job('purgeExpiredTrash', purgeExpiredTrash())
      yield* job('pruneAccessLog', pruneAccessLog())
      yield* job('pruneSecurityLog', pruneSecurityLog(securityLogRetentionDays))
    } else {
      yield* Effect.logWarning('unknown cron expression').pipe(Effect.annotateLogs({ cron }))
    }
  })
