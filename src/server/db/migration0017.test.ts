import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkMigration } from '../../../scripts/check-migrations'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'

const sql0017 = readFileSync(new URL('../../../drizzle/0017_scenes.sql', import.meta.url), 'utf8')

describe('0017_scenes', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite, { to: 17 })
    d1.sqlite.exec(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Ada', 'ada@example.test', 1, 1, 1);
      INSERT INTO organization (id, name, slug, createdAt, kind) VALUES ('w1', 'W', 'w', 1, 'company');
      INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt, workspaceId)
        VALUES ('f1', 'Pump.step', 'w/w1/f/f1/a', 42, 'application/octet-stream', 'step', 'uploaded', 'u1', 1, 1, 'w1');
    `)
  })
  afterEach(() => d1.close())

  it('is additive only: one new table and its indexes; it passes the allowlist', () => {
    expect(checkMigration('0017_scenes.sql', sql0017)).toEqual([])
    expect(sql0017).not.toMatch(/\bALTER\b|\bDROP\b|\bRENAME\b|^\s*(UPDATE|DELETE)\b/im)
  })

  it('leaves existing rows alone and goes with its file', () => {
    const before = d1.sqlite.prepare('SELECT * FROM files').all()
    applyMigrations(d1.sqlite, { from: 17 })
    expect(d1.sqlite.prepare('SELECT * FROM files').all()).toEqual(before)
    const insert = (id: string, key: string, revision = 1, body = '{}', ws = 'w1') =>
      d1.sqlite.exec(`INSERT INTO file_scenes (id, workspaceId, fileId, modelR2Key, revision, body, updatedByUserId, updatedAt) VALUES ('${id}', '${ws}', 'f1', '${key}', ${revision}, '${body}', 'u1', 1)`)
    insert('s1', 'k1')
    expect(() => insert('s2', 'k1')).toThrow(/UNIQUE/)
    expect(() => insert('s3', 'k3', 0)).toThrow(/CHECK/)
    expect(() => insert('s4', 'k4', 1, 'x'.repeat(131073))).toThrow(/CHECK/)
    expect(() => insert('s5', 'k5', 1, '{}', 'w2')).toThrow(/FOREIGN KEY/)
    d1.sqlite.exec(`DELETE FROM user WHERE id = 'u1'`)
    expect(d1.sqlite.prepare('SELECT count(*) AS n FROM file_scenes').get()).toEqual({ n: 0 })
  })
})
