import { describe, expect, it } from 'vitest'
import { decodeComponent } from './uri'

describe('decodeComponent', () => {
  it('decodes like decodeURIComponent for valid input', () => {
    for (const value of ['blog%2Fa%2Fb.png', 'plain', 'caf%C3%A9', 'emoji-%F0%9F%98%80', 'raw-é-😀', '%25', ''])
      expect(decodeComponent(value)).toBe(decodeURIComponent(value))
  })

  it('is null (never a URIError) for malformed escapes, non-UTF-8 bytes, U+FFFD and lone surrogates', () => {
    for (const value of ['blog%2F%FF.png', '%E2%82', '%C3', '%', '%G1', 'a%2', 'x%EF%BF%BDy', 'x�y', 'x\uD800y']) expect(decodeComponent(value)).toBeNull()
  })
})
