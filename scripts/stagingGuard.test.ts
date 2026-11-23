import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { checkStagingConfig, PRODUCTION, STAGING } from './stagingGuard'

/** wrangler.jsonc as Wrangler sees it (comments and trailing commas allowed). */
const source = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync('wrangler.jsonc', 'utf8')).config as {
  env: { production: Record<string, unknown> }
} & Record<string, unknown>

const staging = {
  name: STAGING.worker,
  vars: { SITE_URL: 'https://vizcad-rewrite.example.workers.dev', R2_BUCKET_NAME: STAGING.r2Bucket },
  d1_databases: [{ binding: 'vizcad_auth', database_name: STAGING.d1Name, database_id: STAGING.d1Id }],
  r2_buckets: [{ binding: 'R2_FILES_BUCKET', bucket_name: STAGING.r2Bucket }],
}

describe('checkStagingConfig', () => {
  it('accepts the staging target', () => {
    expect(checkStagingConfig(staging)).toEqual([])
  })

  it('stays in sync with wrangler.jsonc: top level passes, env.production fails on every resource', () => {
    const { env: _, ...topLevel } = source
    expect(checkStagingConfig(topLevel)).toEqual([])
    const problems = checkStagingConfig(source.env.production).join('\n')
    expect(problems).toContain('worker name')
    expect(problems).toContain(PRODUCTION.d1Id)
    expect(problems).toContain(PRODUCTION.r2Bucket)
    expect(source.env.production['name']).toBe(PRODUCTION.worker)
  })

  it.each([
    ['production worker name', { ...staging, name: PRODUCTION.worker }],
    ['production D1', { ...staging, d1_databases: [{ binding: 'vizcad_auth', database_name: PRODUCTION.d1Name, database_id: PRODUCTION.d1Id }] }],
    ['production R2', { ...staging, r2_buckets: [{ binding: 'R2_FILES_BUCKET', bucket_name: PRODUCTION.r2Bucket }] }],
    ['production bucket var', { ...staging, vars: { R2_BUCKET_NAME: PRODUCTION.r2Bucket } }],
    ['production site URL', { ...staging, vars: { SITE_URL: PRODUCTION.siteUrl } }],
    ['missing D1', { ...staging, d1_databases: [] }],
    ['missing R2', { ...staging, r2_buckets: undefined }],
  ])('rejects %s', (_, config) => {
    expect(checkStagingConfig(config).length).toBeGreaterThan(0)
  })
})
