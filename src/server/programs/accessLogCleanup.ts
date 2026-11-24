import { and, asc, gt, inArray, lt, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { Db } from '../services/Db'
import { defaultPlan, Entitlements } from '../services/Entitlements'
import { nowSeconds, toDate } from './shared'

const DAY = 24 * 60 * 60
const PRUNE_BATCH = 1000
const WORKSPACES_PER_PAGE = 50
/** Delete rounds per run across all workspaces (at most 20 000 rows), so one run stays small; the rest follows the next day. */
const MAX_ROUNDS = 20

/**
 * Daily (docs/09 §7.3): deletes `access_log` rows older than the workspace's `Entitlements.auditRetentionDays` (365 on the
 * default plan), in groups of 1000. Candidates are the workspaces that have any row older than the base plan's
 * retention (the shortest there is), walked in id order, and each one is cut at its own plan's cutoff. It is a plain
 * `DELETE`: log rows are never rewritten, only removed once they are old enough.
 */
export const pruneAccessLog = Effect.fn('pruneAccessLog')(function* () {
  const db = yield* Db
  const entitlements = yield* Entitlements
  const now = yield* nowSeconds
  const log = schema.accessLog
  const minCutoff = toDate(now - defaultPlan.auditRetentionDays * DAY)
  let total = 0
  let rounds = 0
  let afterWorkspace: string | null = null
  while (rounds < MAX_ROUNDS) {
    const cursor: string | null = afterWorkspace
    const workspaces: ReadonlyArray<{ readonly workspaceId: string }> = yield* db.use((d) =>
      d.selectDistinct({ workspaceId: log.workspaceId }).from(log)
        .where(and(lt(log.createdAt, minCutoff), cursor === null ? undefined : gt(log.workspaceId, cursor)))
        .orderBy(asc(log.workspaceId)).limit(WORKSPACES_PER_PAGE),
    )
    for (const { workspaceId } of workspaces) {
      const cutoff = toDate(now - (yield* entitlements.limits(workspaceId)).auditRetentionDays * DAY)
      while (rounds < MAX_ROUNDS) {
        rounds++
        const gone = yield* db.use((d) =>
          d.delete(log)
            .where(inArray(log.id, d.select({ id: log.id }).from(log).where(and(sql`${log.workspaceId} = ${workspaceId}`, lt(log.createdAt, cutoff))).limit(PRUNE_BATCH)))
            .returning({ id: log.id }),
        )
        total += gone.length
        if (gone.length < PRUNE_BATCH) break
      }
    }
    const last = workspaces[workspaces.length - 1]
    if (workspaces.length < WORKSPACES_PER_PAGE || last === undefined) break
    afterWorkspace = last.workspaceId
  }
  return { deleted: total }
})
