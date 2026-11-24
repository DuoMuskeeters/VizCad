import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkMigration } from '../../../scripts/check-migrations'
import { readFileSync } from 'node:fs'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'

const sql0014 = readFileSync(new URL('../../../drizzle/0014_files_sharing.sql', import.meta.url), 'utf8')

// Everything the live legacy app writes today (vizcad-legacy `complete-upload`, `versions`, `comments`, `star`, `trash`):
// each statement is shaped exactly like its Drizzle insert/update there, so a trigger or NOT NULL column added by
// 0014 would break one of them (docs/09 §1.3 rule 2, §1.4).
const legacyWrites: ReadonlyArray<readonly [string, string]> = [
  ['upload creates a file row', `INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt, thumbnailR2Key)
    VALUES ('lf1', 'Bracket.step', 'u1/lf1/Bracket.step', 42, 'application/octet-stream', 'step', 'uploaded', 'u1', 1, 1, 'u1/lf1/thumbnail.png')`],
  ['upload creates a pending file row', `INSERT INTO files (id, name, r2Key, size, mimeType, extension, status, userId, createdAt, updatedAt)
    VALUES ('lf2', 'Pending.stl', 'u1/lf2/Pending.stl', 9, 'model/stl', 'stl', 'pending', 'u1', 1, 1)`],
  ['new version snapshots the current row', `INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, changeNote, uploadedByUserId, createdAt)
    VALUES ('lv1', 'lf1', 1, 'u1/lf1/Bracket.step', 42, NULL, 'u1', 2)`],
  ['new version repeats a version number (legacy race)', `INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, uploadedByUserId, createdAt)
    VALUES ('lv2', 'lf1', 1, 'u1/lf1/v1/Bracket.step', 42, 'u1', 2)`],
  ['new version moves the file to a new key', `UPDATE files SET r2Key = 'u1/lf1/v2/Bracket.step', size = 50, name = 'Bracket v2.step', updatedAt = 3 WHERE id = 'lf1'`],
  ['rename', `UPDATE files SET name = 'Renamed.step', updatedAt = 4 WHERE id = 'lf1'`],
  ['move to trash and back', `UPDATE files SET isDeleted = 1, deletedAt = 5 WHERE id = 'lf1'`],
  ['comment and reply', `INSERT INTO file_comments (id, fileId, userId, parentId, content, createdAt, updatedAt) VALUES ('lc1', 'lf1', 'u1', NULL, 'Hi', 1, 1), ('lc2', 'lf1', 'u1', 'lc1', 'Re', 1, 1)`],
  ['duplicate stars', `INSERT INTO file_stars (id, fileId, userId, createdAt) VALUES ('ls1', 'lf1', 'u1', 1), ('ls2', 'lf1', 'u1', 1)`],
  ['recent activity', `INSERT INTO file_activities (id, fileId, userId, action, createdAt) VALUES ('la1', 'lf1', 'u1', 'viewed', 1)`],
  ['share link', `INSERT INTO file_shares (id, fileId, sharedByUserId, shareType, shareToken, password, createdAt, updatedAt) VALUES ('ls', 'lf1', 'u1', 'link', 'legacy-token-0123456789abcdef0123', 'plain', 1, 1)`],
  ['permanent delete cascades through versions, comments and stars', `DELETE FROM files WHERE id = 'lf1'`],
]

describe('0014_files_sharing', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1({ migrate: false })
    applyMigrations(d1.sqlite)
    d1.sqlite.exec(`INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Ada', 'ada@example.test', 1, 1, 1)`)
  })
  afterEach(() => d1.close())

  it('passes the migration safety allowlist', () => {
    expect(checkMigration('0014_files_sharing.sql', sql0014)).toEqual([])
  })

  it('adds only nullable columns to legacy tables and creates no trigger', () => {
    expect(sql0014.toLowerCase()).not.toContain('create trigger')
    for (const table of ['files', 'file_versions', 'file_comments']) {
      const added = d1.sqlite.prepare(`PRAGMA table_info(${table})`).all()
        .filter((column) => ['contentEtag', 'currentVersionNumber', 'currentUploadedByUserId', 'deletedByUserId', 'thumbnailR2Key', 'authorScopeAtWrite', 'versionNumber', 'deletedAt'].includes(String(column['name'])))
      for (const column of added) {
        if (table === 'file_versions' && column['name'] === 'versionNumber') continue
        expect(column['notnull'], `${table}.${String(column['name'])}`).toBe(0)
      }
    }
  })

  it.each(legacyWrites.map(([name, statement], index) => ({ name, index, statement })))('legacy write still succeeds: $name', ({ index }) => {
    for (const [, statement] of legacyWrites.slice(0, index + 1)) d1.sqlite.exec(statement)
  })

  it('leaves every new column NULL for legacy rows and accepts the new shapes', () => {
    for (const [, statement] of legacyWrites.slice(0, 4)) d1.sqlite.exec(statement)
    expect(d1.sqlite.prepare('SELECT contentEtag, currentVersionNumber, currentUploadedByUserId, deletedByUserId FROM files WHERE id = ?').get('lf1'))
      .toEqual({ contentEtag: null, currentVersionNumber: null, currentUploadedByUserId: null, deletedByUserId: null })
    d1.sqlite.exec(`INSERT INTO file_comments (id, fileId, userId, content, createdAt, updatedAt) VALUES ('c1', 'lf1', 'u1', 'x', 1, 1)`)
    expect(d1.sqlite.prepare('SELECT authorScopeAtWrite FROM file_comments').get()).toEqual({ authorScopeAtWrite: null })
    d1.sqlite.exec(`UPDATE file_comments SET authorScopeAtWrite = 'guest'`)
    expect(() => d1.sqlite.exec(`UPDATE file_comments SET authorScopeAtWrite = 'stranger'`)).toThrow(/CHECK/)
  })

  it('creates the expected indexes', () => {
    const indexes = d1.sqlite.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`).all()
    const byName = new Map(indexes.map((row) => [String(row['name']), String(row['sql'])]))
    for (const name of ['file_versions_file_version_idx', 'file_comments_file_created_idx', 'file_stars_user_file_idx', 'file_stars_file_user_idx',
      'access_log_workspace_actor_created_idx', 'upload_sessions_r2_key_uq', 'upload_sessions_user_status_idx', 'upload_sessions_status_expiry_idx',
      'storage_deletions_not_before_idx', 'security_log_created_idx', 'share_links_one_active_uq']) {
      expect(byName.has(name), name).toBe(true)
    }
    // Legacy tables only get non-unique indexes (legacy data may hold duplicates).
    for (const name of ['file_versions_file_version_idx', 'file_comments_file_created_idx', 'file_stars_user_file_idx', 'file_stars_file_user_idx', 'access_log_workspace_actor_created_idx']) {
      expect(byName.get(name)).not.toMatch(/UNIQUE/i)
    }
    expect(byName.get('share_links_one_active_uq')).toMatch(/WHERE/i)
  })

  it('security_log caps the user agent at 256 characters and only takes the fixed events', () => {
    const insert = (event: string, agent: string) => d1.sqlite.prepare(
      `INSERT INTO security_log (id, createdAt, event, ip, userAgent, requestId) VALUES (?, 1, ?, '203.0.113.9', ?, 'ray')`,
    ).run(`s-${event}-${agent.length}`, event, agent)
    insert('link_opened', 'a'.repeat(256))
    expect(() => insert('link_opened', 'a'.repeat(257))).toThrow(/CHECK/)
    expect(() => insert('file.previewed', 'x')).toThrow(/CHECK/)
  })

  it('storage_deletions is keyed by object key and rejects unknown reasons', () => {
    d1.sqlite.exec(`INSERT INTO storage_deletions (key, reason, createdAt, notBefore) VALUES ('w/a/f/b/c', 'upload_rejected', 1, 1)`)
    expect(() => d1.sqlite.exec(`INSERT INTO storage_deletions (key, reason, createdAt, notBefore) VALUES ('w/a/f/b/c', 'upload_rejected', 1, 1)`)).toThrow(/UNIQUE/)
    expect(() => d1.sqlite.exec(`INSERT INTO storage_deletions (key, reason, createdAt, notBefore) VALUES ('k2', 'because', 1, 1)`)).toThrow(/CHECK/)
    expect(d1.sqlite.prepare('SELECT attempts FROM storage_deletions').get()).toEqual({ attempts: 0 })
  })
})
