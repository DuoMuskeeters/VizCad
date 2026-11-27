import { describe, expect, it } from 'vitest'
import { formatLength, formatPlace } from './units'

describe('units', () => {
  it('formats lengths and places in the locale, mm or inches', () => {
    expect(formatLength(1000, 'mm', 'tr')).toBe('1.000,0 mm')
    expect(formatLength(1000, 'in', 'en')).toBe('39.37 in')
    expect(formatPlace(640.4, 'mm', 'en')).toBe('640 mm')
  })
  it('never shows a minus zero (a plane a hair below the origin)', () => {
    expect(formatPlace(-0.0001, 'mm', 'en')).toBe('0 mm')
    expect(formatPlace(-0.3, 'mm', 'en')).toBe('0 mm')
    expect(formatPlace(-0.6, 'mm', 'en')).toBe('-1 mm')
    expect(formatLength(-0.01, 'mm', 'en')).toBe('0.0 mm')
    expect(formatPlace(-0.01, 'in', 'en')).toBe('0.0 in')
  })
})
