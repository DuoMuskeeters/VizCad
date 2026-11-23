/**
 * Pure checks that a Wrangler config targets staging and nothing in production.
 * Used by scripts/staging.ts before any remote migration or deploy; kept in sync with
 * wrangler.jsonc by stagingGuard.test.ts.
 */

export const STAGING = {
  worker: 'vizcad-rewrite',
  d1Name: 'vizcad-staging',
  d1Id: '6c619234-393b-4ef0-b02c-18d7bd814178',
  r2Bucket: 'vizcad-files-staging',
} as const

/** Live resources. Seeing any of these in a staging config means stop. */
export const PRODUCTION = {
  worker: 'vizcad',
  d1Name: 'vizcad_auth',
  d1Id: '9f3e6552-67bb-4dfa-a657-36907390a595',
  r2Bucket: 'vizcad-files-bucket',
  siteUrl: 'https://viz-cad.com',
} as const

interface WranglerLike {
  readonly name?: unknown
  readonly d1_databases?: unknown
  readonly r2_buckets?: unknown
  readonly vars?: unknown
}

const records = (value: unknown): ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : []

/** Returns every problem found; an empty list means the config is safe to use for staging. */
export const checkStagingConfig = (config: WranglerLike): ReadonlyArray<string> => {
  const problems: Array<string> = []
  if (config.name !== STAGING.worker) problems.push(`worker name is ${JSON.stringify(config.name)}, expected "${STAGING.worker}"`)

  const d1 = records(config.d1_databases)
  if (d1.length === 0) problems.push('no D1 database configured')
  for (const db of d1) {
    if (db['database_name'] !== STAGING.d1Name || db['database_id'] !== STAGING.d1Id) {
      problems.push(`D1 ${JSON.stringify(db['database_name'])} (${String(db['database_id'])}) is not ${STAGING.d1Name}`)
    }
  }

  const r2 = records(config.r2_buckets)
  if (r2.length === 0) problems.push('no R2 bucket configured')
  for (const bucket of r2) {
    if (bucket['bucket_name'] !== STAGING.r2Bucket) problems.push(`R2 bucket ${JSON.stringify(bucket['bucket_name'])} is not ${STAGING.r2Bucket}`)
  }

  const vars = typeof config.vars === 'object' && config.vars !== null ? (config.vars as Record<string, unknown>) : {}
  for (const [name, value] of Object.entries(vars)) {
    if (name.startsWith('R2_BUCKET') && value !== STAGING.r2Bucket) problems.push(`var ${name} is ${JSON.stringify(value)}`)
  }

  // Belt and braces: no production identifier anywhere in the file.
  const text = JSON.stringify(config)
  for (const marker of [PRODUCTION.d1Id, PRODUCTION.r2Bucket, `"${PRODUCTION.siteUrl}"`, `"database_name":"${PRODUCTION.d1Name}"`]) {
    if (text.includes(marker)) problems.push(`production identifier ${marker} found`)
  }
  return problems
}
