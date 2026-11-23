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
