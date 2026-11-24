import { describe, expect, it } from 'vitest'
import {
  acceptedExtensions, extensionOf, fileTypeOfExtension, hasValidSignature, isValidFileName, SIGNATURE_BYTES, signatureNeedsTail,
  supportedTypesText, type FileTypeId,
} from './fileTypes'

const enc = new TextEncoder()
const bytes = (text: string) => enc.encode(text)

const sample = (type: FileTypeId, content: Uint8Array) => {
  const head = content.subarray(0, SIGNATURE_BYTES)
  return { size: content.length, head, ...(signatureNeedsTail(type) ? { tail: content.subarray(Math.max(0, content.length - SIGNATURE_BYTES)) } : {}) }
}
const valid = (type: FileTypeId, content: Uint8Array) => hasValidSignature(type, sample(type, content))

const concat = (...parts: ReadonlyArray<Uint8Array>) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}

const binaryStl = (triangles: number, extra = 0) => {
  const out = new Uint8Array(84 + 50 * triangles + extra)
  out.set(bytes('binary header'), 0)
  new DataView(out.buffer).setUint32(80, triangles, true)
  return out
}

const html = bytes('<!doctype html><html><body><script>alert(1)</script>solid facet</body></html>')
const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><text>v 1 2 3</text></svg>')

describe('file names and extensions', () => {
  it('lists every supported type for the unsupported-type message', () => {
    expect(supportedTypesText).toBe('STEP (.step, .stp), IGES (.iges, .igs), STL (.stl), OBJ (.obj), PLY (.ply), 3MF (.3mf)')
    expect(acceptedExtensions).toEqual(['.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.ply', '.3mf'])
  })

  it.each([
    ['Part.STEP', 'step'], ['a.b.c.StL', 'stl'], ['x.3MF', '3mf'], ['noextension', ''], ['.hidden', ''], ['trailing.', ''],
  ])('extensionOf(%s) = %s', (name, extension) => expect(extensionOf(name)).toBe(extension))

  it.each([['stp', 'step'], ['IGS', 'iges'], ['stl', 'stl'], ['dwg', undefined], ['', undefined], ['html', undefined]])(
    'fileTypeOfExtension(%s)', (extension, id) => expect(fileTypeOfExtension(extension)?.id).toBe(id))

  it.each([
    ['Bracket v2.step', true], ['ç ğ ü 部品.stl', true], ['a'.repeat(255), true], ['a'.repeat(256), false], ['', false], ['   ', false],
    ['a/b.stl', false], ['a\\b.stl', false], ['..\\x.stl', false], ['a\nb.stl', false], ['a\u0000.stl', false], ['a\u202ab.stl', false], ['a\u202eb.stl', false], ['a\u2066b.stl', false], ['a\u2069b.stl', false], ['a\u200eb.stl', false], ['a\u200fb.stl', false], ['a\u200bb.stl', true],
  ])('isValidFileName(%j) = %s', (name, ok) => expect(isValidFileName(name)).toBe(ok))
})

describe('STEP', () => {
  it('accepts the ISO header, with a BOM or leading whitespace', () => {
    expect(valid('step', bytes('ISO-10303-21;\nHEADER;'))).toBe(true)
    expect(valid('step', concat(new Uint8Array([0xef, 0xbb, 0xbf]), bytes('  \r\nISO-10303-21;')))).toBe(true)
  })
  it.each([['truncated header', 'ISO-10303-2'], ['lower case', 'iso-10303-21;'], ['wrong text', 'ISO-10303-21 ;'], ['empty', '']])('rejects %s', (_, text) =>
    expect(valid('step', bytes(text))).toBe(false))
  it('rejects HTML and SVG', () => {
    expect(valid('step', html)).toBe(false)
    expect(valid('step', svg)).toBe(false)
  })
})

describe('IGES', () => {
  const start = (length = 80, column = 'S') => `${'x'.repeat(72)}${column}      1`.padEnd(length, ' ').slice(0, length)
  it('accepts an 80 column start record with LF or CRLF', () => {
    expect(valid('iges', bytes(`${start()}\nrest`))).toBe(true)
    expect(valid('iges', bytes(`${start()}\r\nrest`))).toBe(true)
  })
  it.each([['column 73 not S', start(80, 'G')], ['short line', start(79)], ['long line', start(81)]])('rejects %s', (_, line) =>
    expect(valid('iges', bytes(`${line}\nrest`))).toBe(false))
  it('rejects a first line without a terminator and non-printable bytes', () => {
    expect(valid('iges', bytes(start()))).toBe(false)
    expect(valid('iges', bytes(`${start().slice(0, 10)}\u0001${start().slice(11)}\n`))).toBe(false)
  })
  it('rejects HTML', () => expect(valid('iges', html)).toBe(false))
})

describe('STL', () => {
  it('accepts binary STL whose size matches the triangle count, including an empty mesh', () => {
    expect(valid('stl', binaryStl(12))).toBe(true)
    expect(valid('stl', binaryStl(0))).toBe(true)
  })
  it('accepts a large binary STL by its header and total size alone', () => {
    const triangles = 2000
    const full = binaryStl(triangles)
    expect(hasValidSignature('stl', { size: full.length, head: full.subarray(0, SIGNATURE_BYTES) })).toBe(true)
  })
  it('rejects binary STL with a wrong size (truncated or padded)', () => {
    expect(valid('stl', binaryStl(12).subarray(0, 84 + 50 * 12 - 1))).toBe(false)
    expect(valid('stl', binaryStl(12, 1))).toBe(false)
  })
  it('accepts ASCII STL and rejects ASCII without facets, with NUL, or not starting with solid', () => {
    expect(valid('stl', bytes('solid cube\n  facet normal 0 0 1\n    outer loop\n endloop\n endfacet\nendsolid cube'))).toBe(true)
    expect(valid('stl', bytes('  SOLID x\nFACET normal 0 0 1'))).toBe(true)
    expect(valid('stl', bytes('solid empty\nendsolid empty'))).toBe(false)
    expect(valid('stl', bytes('solid x\nfacet\u0000'))).toBe(false)
    expect(valid('stl', bytes('facet normal 0 0 1\nsolid'))).toBe(false)
  })
  it('rejects HTML and SVG named .stl', () => {
    expect(valid('stl', html)).toBe(false)
    expect(valid('stl', svg)).toBe(false)
    expect(valid('stl', bytes('<html>solid\nfacet'))).toBe(false)
  })
  it('rejects an empty file', () => expect(valid('stl', new Uint8Array())).toBe(false))
})

describe('OBJ', () => {
  it('accepts vertex, face, object, group and mtllib lines', () => {
    for (const line of ['v 0 0 0', 'f 1 2 3', 'o part', 'g group', 'mtllib part.mtl', '  v 1 1 1']) {
      expect(valid('obj', bytes(`# comment\n${line}\n`)), line).toBe(true)
    }
  })
  it('rejects NUL, invalid UTF-8 and files without any geometry line', () => {
    expect(valid('obj', bytes('v 0 0 0\u0000'))).toBe(false)
    expect(valid('obj', new Uint8Array([0x76, 0x20, 0xff, 0xfe, 0x0a]))).toBe(false)
    expect(valid('obj', bytes('# only a comment\nusemtl x\n'))).toBe(false)
    expect(valid('obj', bytes('vt 0 0\nvn 0 0 1\n'))).toBe(false)
  })
  it('does not fail on a multi-byte character cut at the sample boundary', () => {
    const body = concat(bytes('v 0 0 0\n'), bytes('ç'.repeat(40000)))
    expect(body.length).toBeGreaterThan(SIGNATURE_BYTES)
    expect(valid('obj', body)).toBe(true)
  })
  it('rejects HTML', () => expect(valid('obj', html)).toBe(false))
})

describe('PLY', () => {
  it('accepts ply with LF or CRLF followed by format', () => {
    expect(valid('ply', bytes('ply\nformat ascii 1.0\n'))).toBe(true)
    expect(valid('ply', bytes('ply\r\nformat binary_little_endian 1.0\r\n'))).toBe(true)
  })
  it.each(['ply format ascii 1.0', 'ply\nelement vertex 3', 'PLY\nformat ascii 1.0', ' ply\nformat ascii 1.0', 'ply\n\nformat ascii 1.0'])('rejects %j', (text) =>
    expect(valid('ply', bytes(text))).toBe(false))
  it('rejects HTML', () => expect(valid('ply', html)).toBe(false))
})

describe('3MF', () => {
  const u16 = (n: number) => new Uint8Array([n & 0xff, n >> 8])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff])
  const centralEntry = (name: string) => concat(new Uint8Array([0x50, 0x4b, 0x01, 0x02]), new Uint8Array(24), u16(name.length), u16(0), u16(0), new Uint8Array(12), bytes(name))
  const zip = (names: ReadonlyArray<string>, padding = 0) => {
    const local = concat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), new Uint8Array(26 + padding))
    const directory = concat(...names.map(centralEntry))
    const end = concat(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), new Uint8Array(8), u32(directory.length), u32(local.length), u16(0))
    return concat(local, directory, end)
  }
  it('accepts a ZIP whose central directory lists 3D/3dmodel.model', () => {
    expect(valid('3mf', zip(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']))).toBe(true)
  })
  it('accepts a large file whose directory sits in the sampled tail', () => {
    expect(valid('3mf', zip(['3D/3dmodel.model'], 200_000))).toBe(true)
  })
  it('rejects a ZIP without the model entry, a similar name, or a different case', () => {
    expect(valid('3mf', zip(['docs/readme.txt']))).toBe(false)
    expect(valid('3mf', zip(['3D/3dmodel.model.bak']))).toBe(false)
    expect(valid('3mf', zip(['3d/3dmodel.model']))).toBe(false)
  })
  it('rejects non-ZIP content, a missing tail and truncated archives', () => {
    expect(valid('3mf', html)).toBe(false)
    const archive = zip(['3D/3dmodel.model'])
    expect(hasValidSignature('3mf', { size: archive.length, head: archive })).toBe(false)
    expect(valid('3mf', archive.subarray(0, archive.length - 10))).toBe(false)
  })
})
