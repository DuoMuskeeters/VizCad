import { and, asc, count, eq, inArray, lt, lte } from 'drizzle-orm'
import { Effect } from 'effect'
import type { PurgeTargets } from '../cms/affectedUrls'
import * as schema from '../db/schema'
import type { CacheError } from '../errors'
import { AppConfig } from '../services/AppConfig'
import { Cache, CacheErrorReason, PURGE_BATCH } from '../services/Cache'
import { type Database, Db } from '../services/Db'
import { fromUnixSeconds } from '../time'
import { nowSeconds, runBatch } from './shared'

/** Every target is purged twice: now and this much later, for a miss that read D1 before the publish and put after the purge. */
export const LATE_PURGE_SECONDS = 60
/** A failed row waits this long before the next try (also the 429 rule for hostname purges, docs/12 §7.4). */
export const RETRY_SECONDS = 60
/** Past this many failed tries a row stays in the queue as "failed" and only a manual retry moves it (docs/12 §7.4). */
export const MAX_ATTEMPTS = 10
/** API calls per run: the publish request tries 2, the admin drain and the cron 3 (≤ 300 URLs). */
export const PUBLISH_MAX_CALLS = 2
export const DRAIN_MAX_CALLS = 3

/** D1 binds at most 100 parameters per statement. */
export const D1_MAX_PARAMS = 100
/**
 * Drizzle binds 6 parameters per queue row: kind, target, reason, createdAt, notBefore and the `attempts` default
 * (id and lastError go in as SQL `null`). 16 rows bind 96. A test checks the largest chunk against `D1_MAX_PARAMS`.
 */
export const INSERT_ROWS_PER_STATEMENT = 16
const IDS_PER_STATEMENT = 90

const chunk = <A>(items: ReadonlyArray<A>, size: number): Array<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

/**
 * Batch statements that queue a purge (docs/12 §7.4 step 1): one row per URL, one `host` row for a hostname purge, each
 * twice (now and `now + 60 s`). Written in the same `db.batch` as the content change, so D1 is the source of truth
 * and a failed purge stays visible. A target already queued for the same moment is kept as it is.
 */
export const enqueuePurges = (d: Database, input: { readonly targets: PurgeTargets; readonly hostname: string; readonly reason: string; readonly now: number }) => {
  const createdAt = fromUnixSeconds(input.now)
  const targets: ReadonlyArray<{ kind: 'url' | 'host'; target: string }> = [
    ...input.targets.urls.map((target) => ({ kind: 'url' as const, target })),
    ...(input.targets.host ? [{ kind: 'host' as const, target: input.hostname }] : []),
  ]
  const rows = [input.now, input.now + LATE_PURGE_SECONDS].flatMap((at) =>
    targets.map((t) => ({ ...t, reason: input.reason, createdAt, notBefore: fromUnixSeconds(at) })),
  )
  return chunk(rows, INSERT_ROWS_PER_STATEMENT).map((values) => d.insert(schema.cachePurges).values([...values]).onConflictDoNothing())
}

export interface DrainSummary {
  /** Set when the drain did nothing on purpose. */
  readonly skipped?: 'not-configured'
  /** Queue rows removed after a successful purge. */
  readonly done: number
  /** Rows whose purge failed in this run (retried after `RETRY_SECONDS`). */
  readonly failed: number
  /** Rows still in the queue (later `notBefore`, failed, or over this run's budget). */
  readonly queued: number
  readonly calls: number
}

type Row = typeof schema.cachePurges.$inferSelect

/**
 * Purges due queue rows with at most `maxCalls` API calls (docs/12 §7.4 steps 2–5). A due `host` row goes first: one
 * hostname purge also covers every due URL row. The rest go 100 URLs per call; a target due twice is sent once.
 * Successful rows are deleted; failed rows get `attempts + 1`, the error reason and `notBefore + 60 s`.
 * Without purge config (K5 open) it logs the reason and leaves the queue untouched.
 */
export const drainCachePurges = Effect.fn('drainCachePurges')(function* (options: { readonly maxCalls?: number } = {}) {
  const db = yield* Db
  const cache = yield* Cache
  const { siteUrl } = yield* AppConfig
  const now = yield* nowSeconds
  const queued = db.use((d) => d.select({ n: count() }).from(schema.cachePurges).get()).pipe(Effect.map((r) => r?.n ?? 0))

  if (!cache.configured) {
    const waiting = yield* queued
    yield* Effect.logWarning('cache purge skipped').pipe(Effect.annotateLogs({ reason: CacheErrorReason.notConfigured, queued: waiting }))
    return { skipped: 'not-configured', done: 0, failed: 0, queued: waiting, calls: 0 } satisfies DrainSummary
  }

  const maxCalls = Math.max(1, options.maxCalls ?? DRAIN_MAX_CALLS)
  const due = (kind: 'url' | 'host', limit: number) =>
    db.use((d) =>
      d.select().from(schema.cachePurges)
        .where(and(lte(schema.cachePurges.notBefore, fromUnixSeconds(now)), lt(schema.cachePurges.attempts, MAX_ATTEMPTS), eq(schema.cachePurges.kind, kind)))
        .orderBy(asc(schema.cachePurges.notBefore), asc(schema.cachePurges.id))
        .limit(limit),
    )

  const succeeded: Array<number> = []
  const failures: Array<{ readonly rows: ReadonlyArray<Row>; readonly reason: string }> = []
  let calls = 0

  const attempt = (rows: ReadonlyArray<Row>, purge: Effect.Effect<void, CacheError>) =>
    purge.pipe(
      Effect.match({
        onSuccess: () => void succeeded.push(...rows.map((r) => r.id)),
        onFailure: (error) => void failures.push({ rows, reason: error.reason }),
      }),
      Effect.tap(() => Effect.sync(() => void calls++)),
    )

  // Host rows name the site host (enqueuePurges); a different one fails the host check and backs off like any failure.
  let hostPurged = false
  for (const [target, rows] of groupBy(yield* due('host', 50))) {
    if (calls >= maxCalls) break
    const before = succeeded.length
    yield* attempt(rows, cache.purgeHost(target))
    if (succeeded.length > before && target === siteUrl.hostname) hostPurged = true
  }

  if (calls < maxCalls) {
    const urlRows = yield* due('url', hostPurged ? 1000 : (maxCalls - calls) * PURGE_BATCH * 2)
    if (hostPurged) {
      // The hostname purge emptied every URL of the host: due URL rows are done without their own call.
      succeeded.push(...urlRows.map((r) => r.id))
    } else {
      const groups = [...groupBy(urlRows)]
      for (const batch of chunk(groups, PURGE_BATCH)) {
        if (calls >= maxCalls) break
        yield* attempt(batch.flatMap(([, rows]) => rows), cache.purge(batch.map(([target]) => target)))
      }
    }
  }

  // A failed target keeps one row, moved to `now + 60 s`. If the target already has a row there (its late purge), that
  // row takes the failure count instead; the unique (kind, target, notBefore) key allows only one. That row can be one
  // of this run's own: an overlapping drain read the same due rows, failed first and already moved it. It is kept.
  const retryAt = fromUnixSeconds(now + RETRY_SECONDS)
  const failedTargets = failures.flatMap(({ rows, reason }) =>
    [...groupBy(rows)].map(([target, group]) => ({
      kind: group[0]?.kind ?? 'url',
      target,
      ids: group.map((r) => r.id),
      attempts: Math.max(...group.map((r) => r.attempts)) + 1,
      reason: reason.slice(0, 200),
    })),
  )
  const atRetry = yield* Effect.forEach(chunk(failedTargets.map((f) => f.target), IDS_PER_STATEMENT), (targets) =>
    db.use((d) =>
      d.select({ id: schema.cachePurges.id, kind: schema.cachePurges.kind, target: schema.cachePurges.target, attempts: schema.cachePurges.attempts })
        .from(schema.cachePurges)
        .where(and(eq(schema.cachePurges.notBefore, retryAt), inArray(schema.cachePurges.target, [...targets]))),
    ),
  ).pipe(Effect.map((lists) => new Map(lists.flat().map((r) => [`${r.kind} ${r.target}`, r]))))

  const deletes = [...succeeded]
  /** `attempts|reason|moved` → ids: rows set to the same values share one statement (D1 counts statements). */
  const updates = new Map<string, { attempts: number; reason: string; move: boolean; ids: Array<number> }>()
  const update = (attempts: number, reason: string, move: boolean, id: number) => {
    const key = `${attempts}|${move}|${reason}`
    const entry = updates.get(key) ?? { attempts, reason, move, ids: [] }
    entry.ids.push(id)
    updates.set(key, entry)
  }
  for (const f of failedTargets) {
    const survivor = atRetry.get(`${f.kind} ${f.target}`)
    const [first, ...rest] = f.ids
    if (survivor !== undefined) {
      deletes.push(...f.ids.filter((id) => id !== survivor.id))
      update(Math.max(survivor.attempts, f.attempts), f.reason, false, survivor.id)
    } else if (first !== undefined) {
      deletes.push(...rest)
      update(f.attempts, f.reason, true, first)
    }
  }

  yield* runBatch((d) => [
    ...chunk(deletes, IDS_PER_STATEMENT).map((ids) => d.delete(schema.cachePurges).where(inArray(schema.cachePurges.id, [...ids]))),
    ...[...updates.values()].flatMap(({ attempts, reason, move, ids }) =>
      chunk(ids, IDS_PER_STATEMENT).map((part) =>
        d.update(schema.cachePurges)
          .set(move ? { attempts, lastError: reason, notBefore: retryAt } : { attempts, lastError: reason })
          .where(inArray(schema.cachePurges.id, [...part])),
      ),
    ),
  ])

  const failed = failures.reduce((n, f) => n + f.rows.length, 0)
  if (failed > 0) {
    yield* Effect.logWarning('cache purge failed').pipe(Effect.annotateLogs({ reasons: [...new Set(failures.map((f) => f.reason))].join(','), failed }))
  }
  return { done: succeeded.length, failed, queued: yield* queued, calls } satisfies DrainSummary
})

/** Groups rows by target, keeping first-seen order. */
const groupBy = (rows: ReadonlyArray<Row>): Map<string, Array<Row>> => {
  const groups = new Map<string, Array<Row>>()
  for (const row of rows) groups.set(row.target, [...(groups.get(row.target) ?? []), row])
  return groups
}
