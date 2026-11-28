import { describe, expect, it } from 'vitest'
import { chunks, IDS_PER_QUERY } from './cache'

describe('cache id chunks', () => {
  it('splits ids so no statement binds more than D1 allows (100, with one more for attempts)', () => {
    const parts = chunks(Array.from({ length: 200 }, (_, i) => i))
    expect(parts.map((p) => p.length)).toEqual([90, 90, 20])
    expect(IDS_PER_QUERY + 1).toBeLessThanOrEqual(100)
  })
})
