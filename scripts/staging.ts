/**
 * The only way to run remote commands against staging (D18: the orchestrator deploys by hand).
 *   node scripts/staging.ts migrate   apply drizzle/ migrations to D1 vizcad-staging
 *   node scripts/staging.ts deploy    build and deploy Worker vizcad-rewrite
 * CLOUDFLARE_ENV is removed so an inherited `production` cannot switch the target, the database is named
 * explicitly (`vizcad-staging` does not exist in env.production), and the config Wrangler will actually
 * read (the build's redirect, if any) is checked by stagingGuard before Wrangler runs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { checkStagingConfig, STAGING } from './stagingGuard.ts'

const childEnv = { ...process.env }
delete childEnv['CLOUDFLARE_ENV']
// Public Turnstile site key of the staging widget ("vizcad staging", host vizcad-rewrite…workers.dev); not a secret.
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
} else {
  stop('usage: node scripts/staging.ts <migrate|deploy>')
}
