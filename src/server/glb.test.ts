import { describe, expect, it } from 'vitest'
import { GLB_HEADER_BYTES, glbHeaderProblem, isValidGlbHeader } from './glb'
import { glb, glbWith } from './testing/glb'

const head = (bytes: Uint8Array) => bytes.slice(0, GLB_HEADER_BYTES)

describe('glbHeaderProblem', () => {
  it('accepts a binary glTF 2.0 whose length is the object size and whose first chunk is JSON', () => {
    const bytes = glb()
    expect(glbHeaderProblem(head(bytes), bytes.byteLength)).toBeUndefined()
    expect(isValidGlbHeader(head(glb({ binBytes: 0 })), glb({ binBytes: 0 }).byteLength)).toBe(true)
    // A header read from the middle of a larger buffer (R2 returns a view) is read at its own offset.
    const padded = new Uint8Array(64)
    padded.set(head(bytes), 7)
    expect(glbHeaderProblem(padded.subarray(7, 27), bytes.byteLength)).toBeUndefined()
  })

  it('names the first problem of a wrong header', () => {
    const bytes = glb()
    const size = bytes.byteLength
    expect(glbHeaderProblem(head(bytes).slice(0, 19), size)).toBe('short')
    expect(glbHeaderProblem(head(bytes), 12)).toBe('short')
    expect(glbHeaderProblem(head(glbWith(0, 0x46546c68)), size)).toBe('magic')
    expect(glbHeaderProblem(new TextEncoder().encode('ISO-10303-21;\nHEADER;\n'), size)).toBe('magic')
    expect(glbHeaderProblem(head(glbWith(4, 1)), size)).toBe('version')
    expect(glbHeaderProblem(head(glbWith(4, 3)), size)).toBe('version')
    expect(glbHeaderProblem(head(bytes), size + 4), 'object larger than declared').toBe('length')
    expect(glbHeaderProblem(head(bytes), size - 4), 'object truncated').toBe('length')
    expect(glbHeaderProblem(head(glbWith(8, size + 1)), size + 1), 'unaligned length').toBe('length')
    expect(glbHeaderProblem(head(glbWith(16, 0x004e4942)), size), 'BIN first').toBe('chunk')
    expect(glbHeaderProblem(head(glbWith(12, 0)), size), 'empty JSON').toBe('chunk')
    expect(glbHeaderProblem(head(glbWith(12, 6)), size), 'unaligned JSON').toBe('chunk')
    expect(glbHeaderProblem(head(glbWith(12, size)), size), 'JSON past the end').toBe('chunk')
  })
})
