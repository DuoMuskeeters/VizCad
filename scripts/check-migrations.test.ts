import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { checkMigration, checkMigrations } from './check-migrations'

it.each([
  ['DROP TABLE', 'dRoP /* comment */\n TABLE IF EXISTS files;'],
  ['__new_', 'CREATE TABLE "__NeW_files" (id text);'],
  ['PRAGMA foreign_keys', 'PRAGMA main . /* comment */ [FOREIGN_KEYS] = OFF;'],
  ['ALTER TABLE … RENAME', 'alter\nTABLE main.`old files` /* comment */ RENAME TO files;'],
  ['ALTER TABLE … RENAME', 'ALTER TABLE "files" RENAME COLUMN "old" TO "new";'],
  ['DROP TABLE', "SELECT '--'; DROP TABLE files;"],
  ['ALTER TABLE … RENAME', 'ALTER TABLE"files"RENAME TO f;'],
  ['PRAGMA foreign_keys', 'PRAGMA[foreign_keys](OFF);'],
])('rejects %s in %s', (rule, sql) => {
  expect(checkMigration('0013_example.sql', sql)).toEqual([rule])
})

it.each([
  ['DROP', 'alter table files drop column r2Key;'],
  ['DROP', 'DROP INDEX x;'],
  ['DROP', 'drop index if exists "x";'],
  ['DROP', 'DROP /* c */ TRIGGER IF EXISTS t;'],
  ['DROP', 'drop\nview v;'],
  ['DROP', 'ALTER TABLE projects DROP COLUMN name;'],
  ['DELETE FROM', 'DELETE FROM user;'],
  ['DELETE FROM', 'delete\n/* c */ from `files` where 1;'],
  ['DELETE FROM', "CREATE TRIGGER t AFTER INSERT ON files BEGIN SELECT 1; END; DELETE FROM user;"],
  ['UPDATE', 'UPDATE files SET r2Key = NULL;'],
  ['UPDATE', 'update\n"files" set r2Key = (select 1);'],
  ['UPDATE', 'INSERT INTO t(id) VALUES (1) ON CONFLICT(id) DO UPDATE SET id = 2;'],
  ['REPLACE INTO', 'REPLACE INTO user (id) VALUES (1);'],
  ['INSERT OR REPLACE', 'INSERT OR REPLACE INTO user (id) VALUES (1);'],
  ['INSERT OR REPLACE', 'insert\nor /* c */ replace into user(id) values (1);'],
  ['PRAGMA writable_schema', 'PRAGMA writable_schema = ON;'],
  ['PRAGMA writable_schema', 'pragma main."Writable_Schema"=1;'],
  ['ALTER legacy table (only nullable ADD COLUMN)', 'ALTER TABLE files ADD COLUMN r2 text NOT NULL DEFAULT \'\';'],
  ['ALTER legacy table (only nullable ADD COLUMN)', 'alter table main."user" add banned integer not\nnull;'],
  ['ALTER legacy table (only nullable ADD COLUMN)', 'ALTER TABLE file_versions ALTER COLUMN r2Key TO x;'],
  ['CREATE TRIGGER without END', 'CREATE TRIGGER t AFTER INSERT ON files BEGIN SELECT 1; DELETE FROM user;'],
])('rejects %s in %s', (rule, sql) => {
  expect(checkMigration('0013_example.sql', sql)).toEqual([rule])
})

it('allows trigger bodies to run DML, including CASE … END, but not the statements after them', () => {
  const trigger = `
    CREATE TRIGGER \`guest_requires_expiry\`
    BEFORE UPDATE OF \`expiresAt\` ON \`file_access\`
    WHEN NEW.expiresAt IS NULL
    BEGIN
      UPDATE \`file_access\` SET updatedAt = CASE WHEN NEW.expiresAt IS NULL THEN 1 ELSE 2 END;
      DELETE FROM \`file_access\` WHERE 0;
      SELECT RAISE(ABORT, 'x; DELETE FROM user');
    END;`
  expect(checkMigration('0013_example.sql', trigger)).toEqual([])
  expect(checkMigration('0013_example.sql', `${trigger}\nUPDATE user SET role = 'x';`)).toEqual(['UPDATE'])
})

it('does not flag keywords hidden in comments or string literals', () => {
  expect(checkMigration('0013_example.sql', `
    -- DELETE FROM user; UPDATE files SET r2Key = 1
    /* DROP INDEX x; REPLACE INTO user; PRAGMA writable_schema = 1 */
    CREATE TABLE note (body text DEFAULT 'DELETE FROM user; DROP INDEX x; INSERT OR REPLACE INTO user');
    CREATE TABLE ref (id text REFERENCES note(id) ON UPDATE NO ACTION ON DELETE CASCADE);
    CREATE TRIGGER t AFTER UPDATE ON note BEGIN SELECT 1; END;
    SELECT replace(body, 'a', 'b') FROM note;
  `)).toEqual([])
})

it('allows nullable additive columns on legacy tables and any additive change elsewhere', () => {
  expect(checkMigration('0013_example.sql', `
    ALTER TABLE files ADD COLUMN projectId text REFERENCES projects(id) ON DELETE RESTRICT;
    ALTER TABLE main.\`user\` ADD banned integer DEFAULT false;
    ALTER TABLE projects ADD COLUMN note text NOT NULL DEFAULT '';
  `)).toEqual([])
})

it('checks legacy filenames without a blanket exemption', () => {
  expect(checkMigration('0011_overjoyed_mandroid.sql', 'DROP TABLE files')).toEqual(['DROP TABLE'])
})

it('allows additive statements and ignores comments and other pragmas', () => {
  expect(checkMigration('0013_example.sql', `
    -- DROP TABLE files
    /* ALTER TABLE files RENAME TO __new_files */
    ALTER TABLE files ADD COLUMN projectId text REFERENCES projects(id);
    CREATE INDEX file_project_idx ON files(projectId);
    PRAGMA foreign_key_check;
    SELECT 'ALTER TABLE files RENAME', 'DROP TABLE files';
  `)).toEqual([])
})

it('reports forbidden SQL in nested files and skips non-SQL files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vizcad-migrations-'))
  try {
    mkdirSync(join(dir, 'nested'))
    writeFileSync(join(dir, 'nested', '0013_unsafe.SQL'), 'DROP TABLE files;')
    writeFileSync(join(dir, 'notes.txt'), 'DROP TABLE files;')
    expect(checkMigrations(dir)).toEqual([join('nested', '0013_unsafe.SQL') + ': forbidden DROP TABLE'])
  } finally {
    rmSync(dir, { recursive: true })
  }
})
