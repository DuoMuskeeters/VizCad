/**
 * Personal workspace backfill (docs/08 §3 step 2). Set-based, deterministic and idempotent:
 *   1. every user without a personal workspace gets one (`personal-<userId>`, slug `personal-<userId>`, name `Personal`);
 *   2. every personal workspace gets its owner membership (`personal-owner-<userId>`) if missing;
 *   3. every file with `workspaceId IS NULL` points at its owner's personal workspace (`projectId` stays NULL).
 * A backfilled personal workspace is stamped `onboardingCompletedAt = <user's createdAt>`: that is the "existing user" mark (D20), so the
 * sign-up onboarding is only ever shown for workspaces created after the backfill (new sign-ups), which start with NULL.
 * Nothing else is written: no ACL/link/invitation mapping (that runs only at the frozen cutover), no R2 key, no
 * `files.userId`, no row deleted. A file whose workspace is already set to something else is left alone and shows
 * up in the review query. The ids match src/server/programs/workspaces.ts (`ensurePersonalWorkspace`).
 *
 * Prerequisite (docs/08 §3): user deletion in the legacy admin panel is disabled first.
 *
 *   node scripts/backfillPersonalWorkspaces.ts <out.sql>          write the backfill SQL
 *   node scripts/backfillPersonalWorkspaces.ts --verify <out.sql>  write the read-only verification queries
 * Staging: `pnpm db:backfill:staging` (scripts/staging.ts backfill). Production: never from here.
 */
import { writeFileSync } from 'node:fs'

export const backfillStatements: ReadonlyArray<string> = [
  `INSERT INTO organization (id, name, slug, logo, createdAt, metadata, kind, personalOwnerUserId, archivedAt, onboardingCompletedAt)
SELECT 'personal-' || u.id, 'Personal', 'personal-' || u.id, NULL, u.createdAt, NULL, 'personal', u.id, NULL, u.createdAt
FROM user u
WHERE NOT EXISTS (SELECT 1 FROM organization o WHERE o.personalOwnerUserId = u.id);`,
  `INSERT INTO member (id, organizationId, userId, role, createdAt)
SELECT 'personal-owner-' || u.id, o.id, u.id, 'owner', o.createdAt
FROM user u JOIN organization o ON o.personalOwnerUserId = u.id AND o.kind = 'personal'
WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = o.id AND m.userId = u.id);`,
  `UPDATE files SET workspaceId = (SELECT o.id FROM organization o WHERE o.personalOwnerUserId = files.userId AND o.kind = 'personal')
WHERE workspaceId IS NULL
AND EXISTS (SELECT 1 FROM organization o WHERE o.personalOwnerUserId = files.userId AND o.kind = 'personal');`,
]

/** Read-only checks after the backfill (docs/08 §3 "Prova doğrulama sorguları"). Every count must be 0. */
export const verifyQueries: Readonly<Record<string, string>> = {
  usersWithoutExactlyOnePersonalWorkspace: `SELECT count(*) AS n FROM user u
WHERE (SELECT count(*) FROM organization o WHERE o.personalOwnerUserId = u.id AND o.kind = 'personal') <> 1`,
  personalWorkspacesWithoutTheirOwner: `SELECT count(*) AS n FROM organization o
WHERE o.kind = 'personal' AND NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = o.id AND m.userId = o.personalOwnerUserId AND m.role = 'owner')`,
  workspacesWithoutExactlyOneOwner: `SELECT count(*) AS n FROM organization o
WHERE o.archivedAt IS NULL AND (SELECT count(*) FROM member m WHERE m.organizationId = o.id AND m.role = 'owner') <> 1`,
  filesWithoutWorkspace: `SELECT count(*) AS n FROM files WHERE workspaceId IS NULL`,
  /** Review list: files already pointing elsewhere (not personal and not a project file). Inspect, do not overwrite. */
  filesOutsideOwnersPersonalWorkspace: `SELECT count(*) AS n FROM files f
WHERE f.projectId IS NULL AND f.workspaceId IS NOT NULL
AND f.workspaceId <> (SELECT o.id FROM organization o WHERE o.personalOwnerUserId = f.userId AND o.kind = 'personal')`,
  crossWorkspaceProjectFiles: `SELECT count(*) AS n FROM files f JOIN projects p ON p.id = f.projectId WHERE p.workspaceId <> f.workspaceId`,
}

const sqlFile = (statements: ReadonlyArray<string>) => `${statements.join('\n\n')}\n`

if (import.meta.url === `file://${process.argv[1]}`) {
  const verify = process.argv[2] === '--verify'
  const out = verify ? process.argv[3] : process.argv[2]
  if (out === undefined) {
    console.error('usage: node scripts/backfillPersonalWorkspaces.ts [--verify] <out.sql>')
    process.exit(1)
  }
  writeFileSync(out, verify ? sqlFile(Object.entries(verifyQueries).map(([name, query]) => `-- ${name}\n${query};`)) : sqlFile(backfillStatements))
  console.log(`wrote ${out}`)
}
