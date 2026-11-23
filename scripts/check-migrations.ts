import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = fileURLToPath(new URL('../drizzle/', import.meta.url))

// Legacy 0000–0011 contain none of the forbidden constructs. If a historical exception is
// ever required, record its exact relative filename, the specific rule, and the reason here.
const legacyExceptions: Readonly<Record<string, Partial<Record<MigrationRule, string>>>> = {}

type MigrationRule = 'DROP TABLE' | '__new_' | 'PRAGMA foreign_keys' | 'ALTER TABLE … RENAME'

export function checkMigration(filename: string, sql: string): MigrationRule[] {
  // Keep identifiers and string literals intact. SQL keywords can touch quoted
  // identifiers without spaces, and comments can appear between any two tokens.
  const tokens = (sql.match(/--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[\w$\u0080-\uFFFF]+|[^\s]/g) ?? [])
    .filter((token) => !token.startsWith('--') && !token.startsWith('/*'))
    .map((token) => token.toLowerCase())
  const unqualified = (at: number) => tokens[at + 1] === '.' ? at + 2 : at
  const violations = new Set<MigrationRule>()
  for (const [i, token] of tokens.entries()) {
    if (token.includes('__new_')) violations.add('__new_')
    if (token === 'drop' && tokens[i + 1] === 'table') violations.add('DROP TABLE')
    if (token === 'alter' && tokens[i + 1] === 'table' && tokens[unqualified(i + 2) + 1] === 'rename') {
      violations.add('ALTER TABLE … RENAME')
    }
    if (token === 'pragma') {
      const pragma = tokens[unqualified(i + 1)]
      if (pragma?.replace(/^["'`\[]|["'`\]]$/g, '') === 'foreign_keys') violations.add('PRAGMA foreign_keys')
    }
  }
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
