import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = fileURLToPath(new URL('../drizzle/', import.meta.url))

// Tables that hold live user data (created by 0000–0011). They only ever grow additively.
const legacyTables: ReadonlySet<string> = new Set([
  'account', 'activity_logs', 'author_profiles', 'file_activities', 'file_comments', 'file_invitations',
  'file_shares', 'file_stars', 'file_versions', 'files', 'posts', 'session', 'survey_responses', 'user',
  'verification',
])

type MigrationRule =
  | 'DROP TABLE'
  | 'DROP'
  | '__new_'
  | 'PRAGMA foreign_keys'
  | 'PRAGMA writable_schema'
  | 'ALTER TABLE … RENAME'
  | 'ALTER legacy table (only nullable ADD COLUMN)'
  | 'DELETE FROM'
  | 'UPDATE'
  | 'REPLACE INTO'
  | 'INSERT OR REPLACE'
  | 'CREATE TRIGGER without END'

// Legacy 0000–0011 predate the allowlist. A historical exception needs the exact relative filename,
// the specific rule, and the reason it cannot be rewritten.
const legacyExceptions: Readonly<Record<string, Partial<Record<MigrationRule, string>>>> = {
  // Already applied in production: each adds a column with `NOT NULL DEFAULT …`, which SQLite accepts.
  '0003_abnormal_marten_broadcloak.sql': { 'ALTER legacy table (only nullable ADD COLUMN)': 'user.storageQuotaGb' },
  '0004_chunky_machine_man.sql': { 'ALTER legacy table (only nullable ADD COLUMN)': 'files.isDeleted' },
  '0008_friendly_goliath.sql': { 'ALTER legacy table (only nullable ADD COLUMN)': 'posts.views' },
}

const unquote = (token: string | undefined) => token?.replace(/^["'`\[]|["'`\]]$/g, '')

export function checkMigration(filename: string, sql: string): MigrationRule[] {
  // Keep identifiers and string literals intact as single tokens. SQL keywords can touch quoted
  // identifiers without spaces, and comments can appear between any two tokens.
  const tokens = (sql.match(/--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[\w$\u0080-\uFFFF]+|[^\s]/g) ?? [])
    .filter((token) => !token.startsWith('--') && !token.startsWith('/*'))
    .map((token) => token.toLowerCase())
  const unqualified = (at: number) => tokens[at + 1] === '.' ? at + 2 : at
  const violations = new Set<MigrationRule>()

  // `CREATE TRIGGER … BEGIN … END` bodies may run UPDATE/DELETE on rows. A CASE … END inside the
  // body must not end it early.
  let pendingTrigger = false
  let inBody = false
  let caseDepth = 0

  for (const [i, token] of tokens.entries()) {
    const previous = tokens[i - 1]
    const next = tokens[i + 1]
    if (token.includes('__new_')) violations.add('__new_')
    if (token === 'drop') violations.add(next === 'table' ? 'DROP TABLE' : 'DROP')
    if (token === 'alter' && next === 'table') {
      const table = unquote(tokens[unqualified(i + 2)])
      const action = tokens[unqualified(i + 2) + 1]
      if (action === 'rename') violations.add('ALTER TABLE … RENAME')
      else if (action !== 'drop' && table && legacyTables.has(table)) {
        // `ADD [COLUMN] name type …` without NOT NULL; SQLite has no other additive ALTER.
        let end = unqualified(i + 2) + 2
        while (end < tokens.length && tokens[end] !== ';') end++
        const definition = tokens.slice(unqualified(i + 2) + 2, end)
        const hasNotNull = definition.some((word, at) => word === 'not' && definition[at + 1] === 'null')
        if (action !== 'add' || hasNotNull) violations.add('ALTER legacy table (only nullable ADD COLUMN)')
      }
    }
    if (token === 'pragma') {
      const pragma = unquote(tokens[unqualified(i + 1)])
      if (pragma === 'foreign_keys') violations.add('PRAGMA foreign_keys')
      if (pragma === 'writable_schema') violations.add('PRAGMA writable_schema')
    }
    if (token === 'replace' && previous === 'or' && tokens[i - 2] === 'insert') violations.add('INSERT OR REPLACE')
    else if (token === 'replace' && next === 'into') violations.add('REPLACE INTO')
    if (!inBody) {
      if (token === 'delete' && next === 'from') violations.add('DELETE FROM')
      // `ON UPDATE` (foreign keys) and trigger events (`BEFORE UPDATE OF`, `INSTEAD OF UPDATE`) are not DML.
      if (token === 'update' && !['on', 'before', 'after', 'of'].includes(previous ?? '')) violations.add('UPDATE')
    }

    if (token === 'trigger' && (previous === 'create' || previous === 'temp' || previous === 'temporary')) {
      pendingTrigger = true
    } else if (token === 'begin' && pendingTrigger && !inBody) {
      inBody = true
      caseDepth = 0
    } else if (inBody && token === 'case') {
      caseDepth++
    } else if (inBody && token === 'end') {
      if (caseDepth > 0) caseDepth--
      else {
        inBody = false
        pendingTrigger = false
      }
    } else if (token === ';' && !inBody) {
      pendingTrigger = false
    }
  }
  if (inBody) violations.add('CREATE TRIGGER without END')
  return [...violations].filter((rule) => !legacyExceptions[filename]?.[rule])
}

export function checkMigrations(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .flatMap((path) => {
      const filename = relative(directory, path)
      return checkMigration(filename, readFileSync(path, 'utf8')).map((rule) => `${filename}: forbidden ${rule}`)
    })
}

if (import.meta.main) {
  const failures = checkMigrations(migrationsDir)
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log('Migration safety check passed')
  }
}
