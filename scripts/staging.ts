/**
 * The only way to run remote commands against staging (D18: the orchestrator deploys by hand).
 *   node scripts/staging.ts migrate   apply drizzle/ migrations to D1 vizcad-staging
 *   node scripts/staging.ts deploy    build and deploy Worker vizcad-rewrite
 *   node scripts/staging.ts backfill  personal workspace backfill on D1 vizcad-staging (docs/08 §3 step 2), then
 *                                     print the verification counts (all must be 0)
 *   node scripts/staging.ts materialize [--source-wins]
 *                                     copy legacy posts into the `en` translation tables on vizcad-staging (docs/12
 *                                     §1.5), print the report and the verification counts (all must be 0)
 * CLOUDFLARE_ENV is removed so an inherited `production` cannot switch the target, the database is named
 * explicitly (`vizcad-staging` does not exist in env.production), and the config Wrangler will actually
 * read (the build's redirect, if any) is checked by stagingGuard before Wrangler runs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { backfillStatements, verifyQueries } from './backfillPersonalWorkspaces.ts'
import { materializeVia } from './materializeLegacyTranslations.ts'
import { checkStagingConfig, STAGING } from './stagingGuard.ts'

const childEnv = { ...process.env }
delete childEnv['CLOUDFLARE_ENV']
// Public Turnstile site key of the staging widget ("vizcad staging", hosts staging.viz-cad.com and vizcad-rewrite…workers.dev); not a secret.
childEnv['VITE_TURNSTILE_SITE_KEY'] ??= '0x4AAAAAAGRHCReriMa9b6dW'

const run = (args: ReadonlyArray<string>) => {
  const result = spawnSync('pnpm', ['exec', ...args], { stdio: 'inherit', env: childEnv })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const stop = (message: string): never => {
  console.error(`staging: ${message}`)
  return process.exit(1)
}

const REDIRECT = resolve('.wrangler/deploy/config.json')

/** The config Wrangler reads from this directory: the build redirect if present, else wrangler.jsonc. */
const redirectTarget = () => {
  if (!existsSync(REDIRECT)) return null
  const { configPath } = JSON.parse(readFileSync(REDIRECT, 'utf8')) as { configPath?: string }
  return configPath ? resolve(dirname(REDIRECT), configPath) : stop(`${REDIRECT} has no configPath`)
}

const verify = (path: string) => {
  const problems = checkStagingConfig(JSON.parse(readFileSync(path, 'utf8')))
  if (problems.length > 0) stop(`refusing to continue, ${path} does not target staging:\n  - ${problems.join('\n  - ')}`)
}

const command = process.argv[2]
if (command === 'migrate') {
  const target = redirectTarget()
  if (target) verify(target)
  run(['wrangler', 'd1', 'migrations', 'apply', STAGING.d1Name, '--remote'])
} else if (command === 'deploy') {
  run(['vite', 'build'])
  const target = redirectTarget()
  const expected = resolve('dist/server/wrangler.json')
  if (target !== expected) stop(`build redirect points to ${String(target)}, expected ${expected}`)
  verify(expected)
  run(['wrangler', 'deploy'])
} else if (command === 'backfill') {
  const target = redirectTarget()
  if (target) verify(target)
  mkdirSync('.wrangler', { recursive: true })
  const file = resolve('.wrangler/backfill-personal-workspaces.sql')
  writeFileSync(file, `${backfillStatements.join('\n\n')}\n`)
  run(['wrangler', 'd1', 'execute', STAGING.d1Name, '--remote', `--file=${file}`])
  for (const [name, query] of Object.entries(verifyQueries)) {
    console.log(`verify: ${name}`)
    run(['wrangler', 'd1', 'execute', STAGING.d1Name, '--remote', `--command=${query.replace(/\s+/g, ' ')}`])
  }
} else if (command === 'materialize') {
  const target = redirectTarget()
  if (target) verify(target)
  mkdirSync('.wrangler', { recursive: true })
  const d1 = (extra: ReadonlyArray<string>) => {
    const result = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', STAGING.d1Name, '--remote', ...extra], {
      env: childEnv,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
    return result.stdout
  }
  const report = materializeVia({
    execJson: (query) => JSON.parse(d1(['--json', `--command=${query}`])),
    execFile: (file) => void d1([`--file=${file}`, '--yes']),
    sqlFile: resolve('.wrangler/materialize-legacy-translations.sql'),
    sourceWins: process.argv.includes('--source-wins'),
  })
  console.log(JSON.stringify(report, null, 2))
} else {
  stop('usage: node scripts/staging.ts <migrate|deploy|backfill|materialize>')
}
