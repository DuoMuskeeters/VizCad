import { describe, expect, it } from 'vitest'
import { canMakeThumbnail, deferOpen, isPhone } from './device'
import { MAX_CONVERT_BYTES } from './worker/protocol'

describe('phone rule (docs/11 §2.5)', () => {
  it('detects phones by memory or by coarse pointer on a narrow screen', () => {
    expect(isPhone({ deviceMemory: 2, coarsePointer: false, shortSide: 1080 })).toBe(true)
    expect(isPhone({ deviceMemory: 8, coarsePointer: true, shortSide: 390 })).toBe(true)
    expect(isPhone({ deviceMemory: 8, coarsePointer: true, shortSide: 820 })).toBe(false)
    expect(isPhone({ coarsePointer: false, shortSide: 390 })).toBe(false)
  })

  it('defers only STEP/IGES opening on phones', () => {
    expect(deferOpen('step', true)).toBe(true)
    expect(deferOpen('iges', true)).toBe(true)
    expect(deferOpen('3mf', true)).toBe(false)
    expect(deferOpen('stl', true)).toBe(false)
    expect(deferOpen('step', false)).toBe(false)
  })

  it('skips STEP/IGES/3MF thumbnails on phones and above the convert limit', () => {
    expect(canMakeThumbnail('stl', 1000, true)).toBe(true)
    expect(canMakeThumbnail('step', 1000, true)).toBe(false)
    expect(canMakeThumbnail('3mf', 1000, true)).toBe(false)
    expect(canMakeThumbnail('step', 1000, false)).toBe(true)
    expect(canMakeThumbnail('step', MAX_CONVERT_BYTES + 1, false)).toBe(false)
  })
})
