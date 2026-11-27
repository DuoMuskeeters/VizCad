import { unstable_readConfig } from 'wrangler'
import { describe, expect, it } from 'vitest'
import { DAILY, HOURLY, PURGE } from '../src/server/programs/cron'

describe('wrangler cron triggers', () => {
  it('staging (top level) has the cron list, production has none', () => {
    const staging = unstable_readConfig({ config: 'wrangler.jsonc' })
    const production = unstable_readConfig({ config: 'wrangler.jsonc', env: 'production' })
    expect(staging.triggers.crons).toEqual([HOURLY, DAILY, PURGE])
    expect(production.triggers.crons).toEqual([])
  })
})
