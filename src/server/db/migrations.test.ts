import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, openMemoryD1, type MemoryD1 } from '../testing/memoryD1'

const legacyMigrationCount = 12

function seedLegacy(d1: MemoryD1) {
  d1.sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u1', 'Ada', 'ada@example.test', 1, 1, 1),
             ('u2', 'Lin', 'lin@example.test', 1, 1, 1),
             ('u3', 'Sam', 'sam@example.test', 1, 1, 1),
             ('u4', 'Bo', 'bo@example.test', 1, 1, 1);
    INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
      VALUES ('a1', 'u1', 'credential', 'u1', 1, 1);
    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
      VALUES ('s1', 100, 'fixture-session-token', 1, 1, 'u1');
    INSERT INTO files (id, userId, name, r2Key, thumbnailR2Key, size, mimeType, extension, status, isDeleted, createdAt, updatedAt)
      VALUES ('f1', 'u1', 'Model', 'cad/u1/model', 'thumb/u1/model', 42, 'application/octet-stream', 'step', 'uploaded', 0, 1, 1),
             ('f2', 'u1', 'Trashed', 'cad/u1/trashed', NULL, 42, 'application/octet-stream', 'step', 'uploaded', 1, 1, 1),
             ('f3', 'u2', 'Pending', 'cad/u2/pending', NULL, 42, 'application/octet-stream', 'step', 'pending', 0, 1, 1);
    INSERT INTO file_versions (id, fileId, versionNumber, r2Key, size, uploadedByUserId, createdAt)
      VALUES ('v1', 'f1', 1, 'cad/u1/model', 42, 'u1', 1);
    INSERT INTO file_comments (id, fileId, userId, content, createdAt, updatedAt)
      VALUES ('c1', 'f1', 'u1', 'Fixture comment', 1, 1);
    INSERT INTO file_shares (id, fileId, sharedByUserId, shareType, shareToken, createdAt, updatedAt)
      VALUES ('share1', 'f1', 'u1', 'link', 'fixture-share-token', 1, 1);
    INSERT INTO file_stars (id, fileId, userId, createdAt) VALUES ('star1', 'f1', 'u1', 1);
    INSERT INTO file_activities (id, fileId, userId, action, createdAt) VALUES ('log1', 'f1', 'u1', 'viewed', 1);
    INSERT INTO file_invitations (id, fileId, invitedByUserId, email, token, createdAt)
      VALUES ('invite1', 'f1', 'u1', 'guest@example.test', 'fixture-invite-token', 1);
  `)
}

it('keeps legacy counts, stored R2 keys and session identity when upgrading a populated database', () => {
  const d1 = openMemoryD1({ migrate: false })
  try {
    applyMigrations(d1.sqlite, { to: legacyMigrationCount })
    seedLegacy(d1)
    const snapshot = () => ({
      counts: ['user', 'account', 'session', 'files', 'file_versions', 'file_comments', 'file_shares',
        'file_stars', 'file_activities', 'file_invitations'].map((table) =>
        d1.sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get()?.['total']),
      fileGroups: d1.sqlite.prepare('SELECT isDeleted, status, count(*) FROM files GROUP BY isDeleted, status').all(),
      fileKeys: d1.sqlite.prepare('SELECT id, userId, r2Key, thumbnailR2Key FROM files ORDER BY id').all(),
      versionKeys: d1.sqlite.prepare('SELECT id, fileId, r2Key FROM file_versions ORDER BY id').all(),
      sessions: d1.sqlite.prepare('SELECT id, token, userId FROM session ORDER BY id').all(),
    })
    const before = snapshot()
    expect(before.counts.every((count) => typeof count === 'number' && count > 0)).toBe(true)

    applyMigrations(d1.sqlite, { from: legacyMigrationCount })
    expect(snapshot()).toEqual(before)
    expect(d1.sqlite.prepare('SELECT count(*) AS total FROM files WHERE workspaceId IS NULL AND projectId IS NULL')
      .get()?.['total']).toBe(3)
    expect(d1.sqlite.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1)
    expect(d1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    d1.close()
  }
})

describe('workspace schema constraints', () => {
  let d1: MemoryD1

  beforeEach(() => {
    d1 = openMemoryD1()
    seedLegacy(d1)
    d1.sqlite.exec(`
      INSERT INTO organization (id, name, slug, kind, personalOwnerUserId, createdAt)
        VALUES ('personal', 'Personal', 'personal', 'personal', 'u1', 1),
               ('company', 'Company', 'company', 'company', NULL, 1),
               ('empty', 'Empty', 'empty', 'company', NULL, 1);
      INSERT INTO member (id, organizationId, userId, role, createdAt)
        VALUES ('m1', 'personal', 'u1', 'owner', 1),
               ('m2', 'company', 'u2', 'owner', 1),
               ('m3', 'company', 'u3', 'member', 1);
      INSERT INTO projects (id, workspaceId, name, createdByUserId, creatorManagerUserId, createdAt, updatedAt)
        VALUES ('p1', 'company', 'Project', 'u3', 'u3', 1, 1);
      UPDATE files SET workspaceId = 'personal' WHERE id = 'f1';
      UPDATE files SET workspaceId = 'company', projectId = 'p1' WHERE id = 'f3';
    `)
  })

  afterEach(() => d1.close())

  it.each([
    ['trigger', 'organization_identity_immutable'],
    ['trigger', 'projects_workspace_immutable'],
    ['trigger', 'files_project_workspace_insert'],
    ['trigger', 'files_project_workspace_update'],
    ['trigger', 'share_links_legacy_ceiling_immutable'],
    ['index', 'session_active_organization_idx'],
    ['index', 'files_workspace_id_uq'],
    ['index', 'files_workspace_deleted_updated_idx'],
    ['index', 'files_workspace_project_deleted_updated_idx'],
    ['index', 'projects_workspace_id_uq'],
    ['index', 'member_single_owner_uq'],
    ['index', 'invitation_pending_organization_email_uq'],
    ['index', 'resource_invitations_pending_project_email_uq'],
    ['index', 'resource_invitations_pending_file_email_uq'],
    ['index', 'share_links_tokenDigest_unique'],
  ])('creates the %s %s', (type, name) => {
    expect(d1.sqlite.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get(type, name)?.['sql'])
      .toBeTruthy()
  })

  it.each([
    ['rejects multi-role members on insert', "INSERT INTO member VALUES ('bad', 'company', 'u1', 'admin,owner', 1)", /member_role_check/],
    ['rejects multi-role members on update', "UPDATE member SET role = 'admin,owner' WHERE id = 'm3'", /member_role_check/],
    ['rejects multi-role invitations', "INSERT INTO invitation (id, organizationId, email, role, expiresAt, createdAt, inviterId) VALUES ('i1', 'company', 'a@example.test', 'admin,owner', 2, 1, 'u2')", /invitation_role_check/],
    ['rejects a second owner in the same workspace', "UPDATE member SET role = 'owner' WHERE id = 'm3'", /UNIQUE constraint failed: member.organizationId/],
    ['restricts deletion of the personal owner even without a membership', "INSERT INTO organization (id,name,slug,createdAt,kind,personalOwnerUserId) VALUES ('p2','P2','p2',1,'personal','u4'); DELETE FROM user WHERE id = 'u4'", /FOREIGN KEY constraint failed/],
    ['restricts deletion of the personal workspace with a membership', "DELETE FROM organization WHERE id = 'personal'", /FOREIGN KEY constraint failed/],
    ['restricts deletion of the workspace of a legacy file after its membership is gone', "DELETE FROM member WHERE id = 'm1'; DELETE FROM organization WHERE id = 'personal'", /FOREIGN KEY constraint failed/],
    ['restricts deletion of a project used by a file', "DELETE FROM projects WHERE id = 'p1'", /FOREIGN KEY constraint failed/],
    ['restricts deletion of the active creator membership', "DELETE FROM member WHERE id = 'm3'", /FOREIGN KEY constraint failed/],
    ['prevents switching the project workspace', "UPDATE projects SET workspaceId = 'empty', creatorManagerUserId = NULL WHERE id = 'p1'", /Project workspace is immutable/],
    ['prevents switching workspace kind', "UPDATE organization SET kind = 'company', personalOwnerUserId = NULL WHERE id = 'personal'", /Workspace kind and personal owner are immutable/],
    ['prevents changing the personal owner', "UPDATE organization SET personalOwnerUserId = 'u3' WHERE id = 'personal'", /Workspace kind and personal owner are immutable/],
    ['prevents duplicate personal workspaces', "INSERT INTO organization (id,name,slug,createdAt,kind,personalOwnerUserId) VALUES ('second','Second','second',1,'personal','u1')", /UNIQUE constraint failed/],
    ['prevents linking a file to a project in a different workspace', "UPDATE files SET projectId = 'p1' WHERE id = 'f1'", /File project must belong to its workspace/],
    ['prevents inserting a file linked to a project without a workspace', "INSERT INTO files (id,userId,name,r2Key,size,mimeType,extension,createdAt,updatedAt,projectId) VALUES ('new','u2','New','key',1,'x','step',1,1,'p1')", /File project must belong to its workspace/],
    ['prevents a file grant crossing workspaces', "INSERT INTO file_access (workspaceId,fileId,userId,level,source,createdAt,updatedAt) VALUES ('company','f1','u2','edit','grant',1,1)", /FOREIGN KEY constraint failed/],
    ['prevents a project grant to a user outside the workspace', "INSERT INTO project_access (workspaceId,projectId,userId,level,createdAt,updatedAt) VALUES ('company','p1','u1','edit',1,1)", /FOREIGN KEY constraint failed/],
  ] as const)('%s', (_name, sql, error) => {
    expect(() => d1.sqlite.exec(sql)).toThrow(error)
  })

  it('sets a deleted active organization to null without deleting the session', () => {
    d1.sqlite.exec("UPDATE session SET activeOrganizationId = 'empty'; DELETE FROM organization WHERE id = 'empty'")
    expect(d1.sqlite.prepare("SELECT activeOrganizationId FROM session WHERE id = 's1'").get()?.['activeOrganizationId'])
      .toBeNull()
  })

  it('cascades both scopes when a membership is removed after clearing the creator marker', () => {
    d1.sqlite.exec(`
      INSERT INTO file_access (workspaceId,fileId,userId,level,source,createdAt,updatedAt)
        VALUES ('company','f3','u3','edit','uploader',1,1);
      INSERT INTO project_access (workspaceId,projectId,userId,level,createdAt,updatedAt)
        VALUES ('company','p1','u3','edit',1,1);
      UPDATE projects SET creatorManagerUserId = NULL WHERE id = 'p1';
      DELETE FROM member WHERE id = 'm3';
    `)
    expect(d1.sqlite.prepare('SELECT * FROM file_access').all()).toEqual([])
    expect(d1.sqlite.prepare('SELECT * FROM project_access').all()).toEqual([])
  })

  it('requires stored link secrets and enforces the immutable legacy ceiling', () => {
    const insert = d1.sqlite.prepare(`
      INSERT INTO share_links (id,workspaceId,fileId,tokenDigest,tokenCiphertext,tokenKeyVersion,
        level,expiresAt,legacyMaxExpiresAt,revision,createdAt,updatedAt)
      VALUES ('link','personal','f1','digest',?,1,'download',?,100,1,1,1)
    `)
    expect(() => insert.run(null, 100)).toThrow(/NOT NULL constraint failed/)
    expect(() => insert.run('ciphertext', null)).toThrow(/share_links_legacy_expiry_check/)
    expect(() => insert.run('ciphertext', 101)).toThrow(/share_links_legacy_expiry_check/)
    insert.run('ciphertext', 100)
    expect(() => d1.sqlite.exec('UPDATE share_links SET legacyMaxExpiresAt = NULL')).toThrow(/immutable/)
  })
})
