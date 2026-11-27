import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkMigration } from '../../../scripts/check-migrations'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'

const sql0018 = readFileSync(new URL('../../../drizzle/0018_comment_anchor.sql', import.meta.url), 'utf8')

describe('0018_comment_anchor', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite, { to: 18 - 1 })
    d1.sqlite.exec(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Ada', 'ada@example.test', 1, 1, 1);
      INSERT INTO organization (id, name, slug, createdAt, kind) VALUES ('w1', 'W', 'w', 1, 'company');
      INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt, workspaceId)
        VALUES ('f1', 'Pump.step', 'w/w1/f/f1/a', 42, 'application/octet-stream', 'step', 'uploaded', 'u1', 1, 1, 'w1');
      INSERT INTO file_comments (id, fileId, userId, parentId, content, createdAt, updatedAt, authorScopeAtWrite, versionNumber, deletedAt)
        VALUES ('c1', 'f1', 'u1', NULL, 'Old comment', 1, 1, 'internal', 1, NULL);
    `)
  })
  afterEach(() => d1.close())

  it('is one nullable ADD COLUMN on file_comments; it passes the allowlist', () => {
    expect(checkMigration('0018_comment_anchor.sql', sql0018)).toEqual([])
    expect(sql0018).toMatch(/^ALTER TABLE `file_comments` ADD `anchor` text CHECK/)
  })

  it('keeps existing comments (anchor NULL) and the legacy insert still works; the length is bounded', () => {
    applyMigrations(d1.sqlite, { from: 18 - 1 })
    expect(d1.sqlite.prepare(`SELECT content, anchor FROM file_comments WHERE id = 'c1'`).get()).toEqual({ content: 'Old comment', anchor: null })
    // The legacy app writes comments without naming the new column.
    d1.sqlite.exec(`INSERT INTO file_comments (id, fileId, userId, content, createdAt, updatedAt) VALUES ('c2', 'f1', 'u1', 'Legacy', 2, 2)`)
    const pin = (id: string, anchor: string) =>
      d1.sqlite.exec(`INSERT INTO file_comments (id, fileId, userId, content, createdAt, updatedAt, anchor) VALUES ('${id}', 'f1', 'u1', 'Pin', 3, 3, '${anchor}')`)
    pin('c3', '{"v":1,"path":"0.1","point":[1,2,3]}')
    expect(() => pin('c4', 'x'.repeat(1025))).toThrow(/CHECK/)
  })
})
