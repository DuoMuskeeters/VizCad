import { describe, expect, it } from 'vitest'
import { fromUnixSeconds, millisToUnixSeconds, toUnixSeconds } from './time'

describe('timestamp helpers', () => {
  it('converts to whole Unix seconds, flooring sub-second parts', () => {
    expect(toUnixSeconds(new Date('2026-11-01T00:00:00.999Z'))).toBe(1793491200)
    expect(millisToUnixSeconds(1793491200999)).toBe(1793491200)
  })

  it('round-trips through fromUnixSeconds', () => {
    expect(fromUnixSeconds(1793491200).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(toUnixSeconds(fromUnixSeconds(1793491200))).toBe(1793491200)
  })

  it('two writes in the same second compare equal (the --source-wins rule, docs/12 §1.3)', () => {
    expect(toUnixSeconds(new Date('2026-11-01T00:00:00.100Z'))).toBe(toUnixSeconds(new Date('2026-11-01T00:00:00.900Z')))
  })
})
