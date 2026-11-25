import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../db/schema'
import { ResourceUnavailable, ValidationError } from '../errors'
import { decidePermission } from '../permissions'
import type { AnyFileView, FilePage } from '../../shared/fileViews'
import { isValidFileName } from '../../shared/fileTypes'
import { Db } from '../services/Db'
import {
  fileGrantsOf, guestView, internalView, loadScope, openFile, scopedInput, summarySelect, type SummaryRow,
} from './fileContext'
import { activity, authorize, type Caller, guard, newUlid, opt, projectForPermission, requireMembership, runBatch, stillRole, toDate } from './shared'

export type FileFilter = 'all' | 'recent' | 'starred' | 'mine'
export type FileSort = 'updated' | 'created' | 'name' | 'size'

/** Rows read from the database per round; below D1's 100 bound parameters for the grant look-up. */
const SCAN_BATCH = 40
const MAX_ROUNDS = 10

/** `recent` (docs/09 §5.1): the caller's last 50 distinct files by logged activity of their own (opened, downloaded, uploaded). */
export const RECENT_FILES = 50
const RECENT_ACTIONS = sql`('file.previewed', 'file.downloaded', 'file.uploaded', 'file.version_uploaded')`

const sortColumn = (sort: FileSort) => {
  const f = schema.files
  switch (sort) {
    case 'updated': return sql`${f.updatedAt}`
    case 'created': return sql`${f.createdAt}`
    case 'size': return sql`${f.size}`
    case 'name': return sql`lower(${f.name})`
  }
}

/** Keyset cursor `<id>|<sort value>`; the id never contains `|`, the value may. */
const encodeCursor = (id: string, value: string | number) => `${id}|${value}`

const decodeCursor = (cursor: string, sort: FileSort) => {
  const bar = cursor.indexOf('|')
  const id = cursor.slice(0, bar)
  const raw = cursor.slice(bar + 1)
  if (bar < 1) return Effect.fail(new ValidationError({ message: 'invalid cursor' }))
  if (sort === 'name') return Effect.succeed({ id, value: raw as string | number })
  const value = Number(raw)
  return Number.isSafeInteger(value) && raw !== '' ? Effect.succeed({ id, value: value as string | number }) : Effect.fail(new ValidationError({ message: 'invalid cursor' }))
}

const likePattern = (query: string) => `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`

export interface ListFilesInput {
  readonly workspaceId: string
  readonly projectId?: string
  readonly filter: FileFilter
  readonly query?: string
  readonly sort: FileSort
  readonly direction?: 'asc' | 'desc'
  readonly limit: number
  readonly cursor: string | null
}

/**
 * The files the caller may see, one page (docs/09 §5.1). The database narrows the candidates (workspace, state, filter,
 * and for guests and non-managers the files they could possibly reach); every row then goes through permissions.ts
 * `view`, so the SQL is only a speed-up and never the rule. Keyset paging on `(sort value, id)`. A guest gets
 * `GuestFileView` rows, everyone else `FileView`. `projectId` lists one project and needs project-level view access.
 */
export const listFiles = Effect.fn('listFiles')(function* (caller: Caller, input: ListFilesInput) {
  const scope = yield* loadScope(caller, input.workspaceId)
  const db = yield* Db
  const f = schema.files
  const me = caller.userId
  if (input.projectId !== undefined) {
    const project = scope.projects.get(input.projectId)
    if (project === undefined) return yield* new ResourceUnavailable()
    const grant = scope.projectGrants.get(project.id)?.grant
    yield* authorize({ actor: scope.actor, workspace: scope.workspace, project: projectForPermission(project), ...opt('projectGrant', grant), now: scope.now, action: { kind: 'view' } })
  }
  const direction = input.direction ?? (input.sort === 'name' ? 'asc' : 'desc')
  const key = sortColumn(input.sort)
  const after = input.cursor === null ? null : yield* decodeCursor(input.cursor, input.sort)

  const manager = scope.role === 'owner' || scope.role === 'admin'
  const conditions: Array<SQL | undefined> = [
    eq(f.workspaceId, input.workspaceId), eq(f.isDeleted, false), eq(f.status, 'uploaded'),
    input.projectId === undefined ? undefined : eq(f.projectId, input.projectId),
    input.filter === 'recent'
      ? sql`${f.id} IN (SELECT targetId FROM (SELECT targetId FROM access_log WHERE workspaceId = ${input.workspaceId} AND actorUserId = ${me}
        AND targetKind = 'file' AND action IN ${RECENT_ACTIONS} AND outcome = 'allowed' GROUP BY targetId ORDER BY max(createdAt) DESC LIMIT ${RECENT_FILES}))`
      : undefined,
    input.filter === 'starred' ? sql`EXISTS (SELECT 1 FROM file_stars s WHERE s.fileId = ${f.id} AND s.userId = ${me})` : undefined,
    input.filter === 'mine'
      ? sql`(${f.userId} = ${me} OR EXISTS (SELECT 1 FROM file_access u WHERE u.fileId = ${f.id} AND u.userId = ${me} AND u.source = 'uploader'))`
      : undefined,
    input.query === undefined || input.query.trim() === '' ? undefined : sql`lower(${f.name}) LIKE ${likePattern(input.query.trim())} ESCAPE '\\'`,
    // Speed-up only: a guest reaches files through grants; a non-manager does not reach restricted projects without one.
    scope.role === 'guest'
      ? sql`(EXISTS (SELECT 1 FROM file_access g WHERE g.fileId = ${f.id} AND g.userId = ${me})
        OR (${f.projectId} IS NOT NULL AND EXISTS (SELECT 1 FROM project_access pg WHERE pg.projectId = ${f.projectId} AND pg.userId = ${me})))`
      : manager ? undefined
      : sql`(${f.projectId} IS NULL OR ${schema.projects.accessMode} = 'team'
        OR EXISTS (SELECT 1 FROM project_access pg WHERE pg.projectId = ${f.projectId} AND pg.userId = ${me})
        OR EXISTS (SELECT 1 FROM file_access g WHERE g.fileId = ${f.id} AND g.userId = ${me}))`,
  ]
  const order = direction === 'asc' ? [asc, asc] as const : [desc, desc] as const
  const keyset = (cursor: { id: string; value: string | number } | null) =>
    cursor === null ? undefined
    : direction === 'asc' ? sql`(${key} > ${cursor.value} OR (${key} = ${cursor.value} AND ${f.id} > ${cursor.id}))`
    : sql`(${key} < ${cursor.value} OR (${key} = ${cursor.value} AND ${f.id} < ${cursor.id}))`

  const items: Array<{ readonly view: AnyFileView; readonly cursor: string }> = []
  let cursor = after
  let exhausted = false
  for (let round = 0; round < MAX_ROUNDS && items.length <= input.limit && !exhausted; round++) {
    const rows = yield* db.use((d) =>
      summarySelect(d, me, key).where(and(...conditions, keyset(cursor))).orderBy(order[0](key), order[1](f.id)).limit(SCAN_BATCH),
    )
    if (rows.length < SCAN_BATCH) exhausted = true
    const grants = yield* fileGrantsOf(input.workspaceId, me, rows.map((r) => r.id))
    for (const row of rows) {
      const value = row.sortValue
      cursor = { id: row.id, value }
      const grant = grants.get(row.id)
      const base = scopedInput(scope, row, grant)
      if (base === undefined || !decidePermission({ ...base, action: { kind: 'view' } }).allowed) continue
      items.push({
        view: scope.role === 'guest'
          ? guestView(row, base, grant?.grantorName ?? (row.projectId === null ? undefined : scope.projectGrants.get(row.projectId)?.grantorName) ?? scope.workspace.name)
          : internalView(row, base),
        cursor: encodeCursor(row.id, value),
      })
    }
  }
  const page = items.slice(0, input.limit)
  const more = items.length > input.limit || !exhausted
  const last = page[page.length - 1]
  const nextCursor = more ? (items.length > input.limit ? last?.cursor : cursor === null ? undefined : encodeCursor(cursor.id, cursor.value)) ?? null : null
  return { items: page.map((i) => i.view), nextCursor } satisfies FilePage
})

const summaryOf = Effect.fnUntraced(function* (me: string, fileId: string) {
  const db = yield* Db
  const rows = yield* db.use((d) => summarySelect(d, me).where(eq(schema.files.id, fileId)).limit(1))
  const row: SummaryRow | undefined = rows[0]
  if (row === undefined) return yield* new ResourceUnavailable()
  return row
})

/** One file for the detail panel: `FileView` for internal roles, `GuestFileView` for a guest (docs/09 §3.5). */
export const getFile = Effect.fn('getFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file, role, workspace } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  const row = yield* summaryOf(caller.userId, file.id)
  if (role !== 'guest') return internalView(row, base)
  const db = yield* Db
  const names = yield* db.use((d) =>
    Promise.all([
      d.select({ name: schema.user.name }).from(schema.fileAccess).innerJoin(schema.user, eq(schema.user.id, schema.fileAccess.grantedByUserId))
        .where(and(eq(schema.fileAccess.fileId, file.id), eq(schema.fileAccess.userId, caller.userId))).limit(1),
      file.projectId === null ? Promise.resolve([]) : d.select({ name: schema.user.name }).from(schema.projectAccess).innerJoin(schema.user, eq(schema.user.id, schema.projectAccess.grantedByUserId))
        .where(and(eq(schema.projectAccess.projectId, file.projectId), eq(schema.projectAccess.userId, caller.userId))).limit(1),
    ]),
  )
  return guestView(row, base, names[0][0]?.name ?? names[1][0]?.name ?? workspace.name)
})

/**
 * The name a rename produces: the extension is fixed, the user changes only the base name (docs/09 §5.4). A typed name
 * that already ends with the extension (any case) is taken as it is; otherwise the extension is appended. The result goes
 * through the same name rules as an upload.
 */
export const renamedTo = (current: { readonly name: string; readonly extension: string }, typed: string) => {
  const extension = current.extension.toLowerCase()
  const keeps = current.name.toLowerCase().endsWith(`.${extension}`)
  const suffix = keeps ? current.name.slice(current.name.length - extension.length - 1) : `.${extension}`
  const text = typed.trim()
  const full = text.toLowerCase().endsWith(suffix.toLowerCase()) ? text : text + suffix
  const base = full.slice(0, full.length - suffix.length)
  return isValidFileName(full) && base.trim() !== '' ? full : undefined
}

export const renameFile = Effect.fn('renameFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string; readonly name: string }) {
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  const name = renamedTo(file, input.name)
  if (name === undefined) return yield* new ValidationError({ message: 'invalid file name' })
  yield* authorize({ ...base, action: { kind: 'edit' } })
  const at = toDate(base.now)
  const activityId = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}`),
    d.update(schema.files).set({ name, updatedAt: at }).where(and(eq(schema.files.id, file.id), eq(schema.files.workspaceId, input.workspaceId))),
    // The event only; the old and the new name are never written to the log (docs/09 §5.4).
    activity(d, { workspaceId: input.workspaceId, caller, targetKind: 'file', targetId: file.id, action: 'file.renamed', at: base.now }, activityId),
  ])
  return { fileId: file.id, name }
})

/** Stars a file for the caller. Repeating it, or legacy duplicate rows, change nothing. */
export const starFile = Effect.fn('starFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { base, file, role, still } = yield* openFile(caller, input.workspaceId, input.fileId)
  yield* authorize({ ...base, action: { kind: 'view' } })
  const id = yield* newUlid
  yield* runBatch((d) => [
    guard(d, sql`${stillRole(input.workspaceId, caller.userId, [role])} AND ${still(false)}`),
    d.insert(schema.fileStars).select(sql`SELECT ${id}, ${file.id}, ${caller.userId}, ${base.now}
      WHERE NOT EXISTS (SELECT 1 FROM file_stars WHERE fileId = ${file.id} AND userId = ${caller.userId})`),
  ])
  return { fileId: file.id, starred: true }
})

/**
 * Removes the caller's star (every row of the pair, so legacy duplicates go too). Needs membership only: a star on a file
 * the caller lost access to stays in the table but is never listed, and can still be cleared.
 */
export const unstarFile = Effect.fn('unstarFile')(function* (caller: Caller, input: { readonly workspaceId: string; readonly fileId: string }) {
  const { role } = yield* requireMembership(input.workspaceId, caller.userId)
  yield* runBatch((d) => [
    guard(d, stillRole(input.workspaceId, caller.userId, [role])),
    d.delete(schema.fileStars).where(and(
      eq(schema.fileStars.fileId, input.fileId), eq(schema.fileStars.userId, caller.userId),
      sql`${schema.fileStars.fileId} IN (SELECT id FROM files WHERE workspaceId = ${input.workspaceId})`,
    )),
  ])
  return { fileId: input.fileId, starred: false }
})
