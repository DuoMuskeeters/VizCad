import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkMigration } from '../../../scripts/check-migrations'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'

const sql0015 = readFileSync(new URL('../../../drizzle/0015_viewer.sql', import.meta.url), 'utf8')

describe('0015_viewer', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite, { to: 15 })
    d1.sqlite.exec(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Ada', 'ada@example.test', 1, 1, 1);
      INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt, thumbnailR2Key)
        VALUES ('lf1', 'Bracket.step', 'u1/lf1/Bracket.step', 42, 'application/octet-stream', 'step', 'uploaded', 'u1', 1, 1, 'u1/lf1/thumbnail.png');
      INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, uploadedByUserId, createdAt) VALUES ('lv1', 'lf1', 1, 'u1/lf1/old.step', 40, 'u1', 1);
    `)
  })
  afterEach(() => d1.close())

  it('is additive only: nullable columns, a new table and indexes; it passes the allowlist', () => {
    expect(checkMigration('0015_viewer.sql', sql0015)).toEqual([])
    expect(sql0015).not.toMatch(/\bDROP\b|\bRENAME\b|^\s*(UPDATE|DELETE)\b/im)
    expect(sql0015).not.toMatch(/derivative\w*` text NOT NULL/i)
  })

  it('keeps existing rows as they are, with every derivative column NULL; legacy writes still work', () => {
    const before = d1.sqlite.prepare('SELECT id, r2Key, thumbnailR2Key, size FROM files').all()
    applyMigrations(d1.sqlite, { from: 15 })
    expect(d1.sqlite.prepare('SELECT id, r2Key, thumbnailR2Key, size FROM files').all()).toEqual(before)
    expect(d1.sqlite.prepare('SELECT derivativeR2Key, derivativeState, derivativeMeta FROM files').all()).toEqual([{ derivativeR2Key: null, derivativeState: null, derivativeMeta: null }])
    expect(d1.sqlite.prepare('SELECT derivativeR2Key, derivativeState, derivativeMeta FROM file_versions').all()).toEqual([{ derivativeR2Key: null, derivativeState: null, derivativeMeta: null }])
    // The legacy app's own statements (it names its columns) are unaffected.
    d1.sqlite.exec(`INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt) VALUES ('lf2', 'P.stl', 'u1/lf2/P.stl', 9, 'model/stl', 'stl', 'pending', 'u1', 1, 1)`)
    d1.sqlite.exec(`INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, uploadedByUserId, createdAt) VALUES ('lv2', 'lf1', 2, 'u1/lf1/v2.step', 41, 'u1', 2)`)
    d1.sqlite.exec(`DELETE FROM files WHERE id = 'lf1'`)
    expect(d1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('accepts only the three derivative states', () => {
    applyMigrations(d1.sqlite, { from: 15 })
    for (const state of ['ready', 'failed', 'too_large']) d1.sqlite.exec(`UPDATE files SET derivativeState = '${state}' WHERE id = 'lf1'`)
    expect(() => d1.sqlite.exec(`UPDATE files SET derivativeState = 'pending' WHERE id = 'lf1'`)).toThrow(/CHECK/)
    expect(() => d1.sqlite.exec(`UPDATE file_versions SET derivativeState = 'done' WHERE id = 'lv1'`)).toThrow(/CHECK/)
  })

  it('derivative_sessions: unique GLB key, status and size checks, workspace and user RESTRICT', () => {
    applyMigrations(d1.sqlite, { from: 15 })
    d1.sqlite.exec(`INSERT INTO organization (id, name, slug, createdAt, kind) VALUES ('w1', 'W', 'w', 1, 'company')`)
    const insert = (id: string, key: string, status = 'pending', size = 10, completedAt: number | null = null) =>
      d1.sqlite.exec(`INSERT INTO derivative_sessions (id, workspaceId, fileId, sourceR2Key, userId, r2Key, declaredSize, status, expiresAt, createdAt, completedAt)
        VALUES ('${id}', 'w1', 'lf1', 'src', 'u1', '${key}', ${size}, '${status}', 100, 1, ${completedAt ?? 'NULL'})`)
    insert('d1', 'w/w1/f/lf1/a.glb')
    expect(() => insert('d2', 'w/w1/f/lf1/a.glb')).toThrow(/UNIQUE/)
    expect(() => insert('d3', 'k3', 'uploaded')).toThrow(/CHECK/)
    expect(() => insert('d4', 'k4', 'pending', 0)).toThrow(/CHECK/)
    expect(() => insert('d5', 'k5', 'completed')).toThrow(/CHECK/)
    insert('d6', 'k6', 'completed', 10, 5)
    expect(() => d1.sqlite.exec(`DELETE FROM organization WHERE id = 'w1'`)).toThrow(/FOREIGN KEY/)
  })
})
