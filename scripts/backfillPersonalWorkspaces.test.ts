import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, type MemoryD1, openMemoryD1 } from '../src/server/testing/memoryD1'
import { backfillStatements, verifyQueries } from './backfillPersonalWorkspaces'

const T = 1795514400

/** Legacy-shaped data written while only 0000–0011 exist, as in production today. */
const seedLegacy = (db: DatabaseSync) => {
  const user = db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
  user.run('uA', 'Ada', 'ada@example.com', 1, T - 300, T - 300)
  user.run('ub', 'Bob', 'bob@example.com', 0, T - 200, T - 200)
  user.run('UB', 'Bob Upper', 'bob2@example.com', 1, T - 100, T - 100) // same id but for case: slugs must not collide
  user.run('uc', 'Cat', 'cat@example.com', 1, T - 50, T - 50) // no files
  const file = db.prepare(`INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt, isDeleted, thumbnailR2Key)
    VALUES (?, ?, ?, 10, 'model/step', 'step', ?, ?, ?, ?, ?, ?)`)
  file.run('f1', 'a.step', 'users/uA/a.step', 'uploaded', 'uA', T, T, 0, 'thumbs/uA/a.png')
  file.run('f2', 'b.step', 'users/uA/b.step', 'pending', 'uA', T, T, 0, null)
  file.run('f3', 'c.step', 'users/ub/c.step', 'uploaded', 'ub', T, T, 1, null) // in trash
  file.run('f4', 'd.step', 'users/UB/d.step', 'failed', 'UB', T, T, 0, null)
  db.prepare(`INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, uploadedByUserId, createdAt) VALUES ('v1', 'f1', 1, 'users/uA/a.v1.step', 10, 'uA', ?)`).run(T)
  db.prepare(`INSERT INTO file_shares (id, fileId, sharedByUserId, sharedWithUserId, shareType, permission, isActive, createdAt, updatedAt)
    VALUES ('s1', 'f1', 'uA', 'ub', 'user', 'view', 1, ?, ?)`).run(T, T)
}

const snapshot = (db: DatabaseSync) => ({
  organization: db.prepare('SELECT * FROM organization ORDER BY id').all(),
  member: db.prepare('SELECT * FROM member ORDER BY id').all(),
  files: db.prepare('SELECT * FROM files ORDER BY id').all(),
  versions: db.prepare('SELECT * FROM file_versions ORDER BY id').all(),
  shares: db.prepare('SELECT * FROM file_shares ORDER BY id').all(),
  access: db.prepare('SELECT count(*) AS n FROM file_access').get(),
  links: db.prepare('SELECT count(*) AS n FROM share_links').get(),
})

const runBackfill = (db: DatabaseSync) => {
  for (const statement of backfillStatements) db.exec(statement)
}

const count = (db: DatabaseSync, query: string) => Number(db.prepare(query).get()?.['n'])

describe('personal workspace backfill', () => {
  let d1: MemoryD1
  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite, { to: 12 })
    seedLegacy(d1.sqlite)
    applyMigrations(d1.sqlite, { from: 12 })
  })
  afterEach(() => d1.close())

  it('gives every user one personal workspace and owner membership, and every file its owner workspace', () => {
    const before = snapshot(d1.sqlite)
    runBackfill(d1.sqlite)
    const after = snapshot(d1.sqlite)

    expect(after.organization.map((o) => [o['id'], o['slug'], o['kind'], o['personalOwnerUserId'], o['name']])).toEqual([
      ['personal-UB', 'personal-UB', 'personal', 'UB', 'Personal'],
      ['personal-uA', 'personal-uA', 'personal', 'uA', 'Personal'],
      ['personal-ub', 'personal-ub', 'personal', 'ub', 'Personal'],
      ['personal-uc', 'personal-uc', 'personal', 'uc', 'Personal'],
    ])
    expect(after.member.map((m) => [m['id'], m['organizationId'], m['userId'], m['role']])).toEqual([
      ['personal-owner-UB', 'personal-UB', 'UB', 'owner'],
      ['personal-owner-uA', 'personal-uA', 'uA', 'owner'],
      ['personal-owner-ub', 'personal-ub', 'ub', 'owner'],
      ['personal-owner-uc', 'personal-uc', 'uc', 'owner'],
    ])
    expect(after.files.map((f) => [f['id'], f['workspaceId'], f['projectId']])).toEqual([
      ['f1', 'personal-uA', null], ['f2', 'personal-uA', null], ['f3', 'personal-ub', null], ['f4', 'personal-UB', null],
    ])
    // Everything but workspaceId is untouched: R2 keys, owners, status, trash, versions, legacy shares.
    const strip = (rows: ReadonlyArray<Record<string, unknown>>) => rows.map(({ workspaceId: _, ...rest }) => rest)
    expect(strip(after.files)).toEqual(strip(before.files))
    expect(after.versions).toEqual(before.versions)
    expect(after.shares).toEqual(before.shares)
    // No ACL or link mapping before the frozen cutover.
    expect([after.access, after.links]).toEqual([{ n: 0 }, { n: 0 }])
    for (const [name, query] of Object.entries(verifyQueries)) expect(count(d1.sqlite, query), name).toBe(0)
  })

  it('is idempotent: a second run changes nothing', () => {
    runBackfill(d1.sqlite)
    const once = snapshot(d1.sqlite)
    runBackfill(d1.sqlite)
    expect(snapshot(d1.sqlite)).toEqual(once)
  })

  it('keeps a personal workspace created earlier under another id, and never overwrites a set workspace', () => {
    d1.sqlite.exec(`INSERT INTO organization (id, name, slug, createdAt, kind, personalOwnerUserId) VALUES ('ws-old', 'Mine', 'mine', ${T}, 'personal', 'uA')`)
    d1.sqlite.exec(`INSERT INTO organization (id, name, slug, createdAt, kind) VALUES ('acme', 'Acme', 'acme', ${T}, 'company')`)
    d1.sqlite.exec(`INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES ('m1', 'acme', 'ub', 'owner', ${T})`)
    d1.sqlite.exec(`UPDATE files SET workspaceId = 'acme' WHERE id = 'f3'`)
    runBackfill(d1.sqlite)
    expect(d1.sqlite.prepare(`SELECT id FROM organization WHERE personalOwnerUserId = 'uA'`).all().map((r) => r['id'])).toEqual(['ws-old'])
    expect(d1.sqlite.prepare(`SELECT id, workspaceId FROM files ORDER BY id`).all().map((r) => [r['id'], r['workspaceId']])).toEqual([
      ['f1', 'ws-old'], ['f2', 'ws-old'], ['f3', 'acme'], ['f4', 'personal-UB'],
    ])
    // f3 points at a company workspace without a project: it is listed for review, not changed.
    expect(count(d1.sqlite, verifyQueries['filesOutsideOwnersPersonalWorkspace'] ?? '')).toBe(1)
  })
})
