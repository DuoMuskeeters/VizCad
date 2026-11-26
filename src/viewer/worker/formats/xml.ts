/**
 * A small streaming XML reader for 3MF model parts (docs/11 §1.2): Workers have no DOMParser. It reports start and end
 * tags with their attributes and skips the prolog, comments, CDATA, processing instructions and text. Names are reported
 * without their namespace prefix; that is enough for the 3MF core, materials and production elements we read.
 * Hostile input: every scan is linear (no backtracking pattern), a tag is at most `MAX_TAG_LENGTH` characters and an
 * attribute name at most `MAX_NAME_LENGTH`, with at most `MAX_ATTRIBUTES` attributes per tag.
 */

/** Longest tag, `<` to `>`. 3MF tags are a few hundred characters; names and transforms included. */
export const MAX_TAG_LENGTH = 64 * 1024
export const MAX_NAME_LENGTH = 256
export const MAX_ATTRIBUTES = 64

export type XmlAttributes = Readonly<Record<string, string>>

export type XmlHandler = {
  readonly open: (name: string, attributes: XmlAttributes, selfClosing: boolean) => void
  readonly close?: (name: string) => void
}

export class XmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlError'
  }
}

const localName = (name: string) => {
  const colon = name.indexOf(':')
  return colon < 0 ? name : name.slice(colon + 1)
}

const entity = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g

export const decodeEntities = (value: string) =>
  value.indexOf('&') < 0
    ? value
    : value.replace(entity, (_, body: string) => {
        switch (body) {
          case 'amp':
            return '&'
          case 'lt':
            return '<'
          case 'gt':
            return '>'
          case 'quot':
            return '"'
          case 'apos':
            return "'"
          default: {
            const code = body.startsWith('#x') ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
          }
        }
      })

const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\r' || c === '\t'

/** Attributes by local name; `xmlns` declarations are dropped. A token without `="…"` is skipped. One pass, no regex. */
export const parseAttributes = (text: string): XmlAttributes => {
  const out: Record<string, string> = {}
  let count = 0
  let i = 0
  while (i < text.length) {
    while (isSpace(text[i])) i++
    const start = i
    while (i < text.length && !isSpace(text[i]) && text[i] !== '=' && text[i] !== '/' && text[i] !== '>') i++
    const name = text.slice(start, i)
    if (name.length > MAX_NAME_LENGTH) throw new XmlError('attribute name too long')
    while (isSpace(text[i])) i++
    if (text[i] !== '=') {
      // Not an attribute (a stray word or `/`): skip one character so the scan always advances.
      if (name === '') i++
      continue
    }
    i++
    while (isSpace(text[i])) i++
    const quote = text[i]
    if (quote !== '"' && quote !== "'") continue
    const end = text.indexOf(quote, i + 1)
    if (end < 0) throw new XmlError('unterminated attribute value')
    const value = text.slice(i + 1, end)
    i = end + 1
    if (name === '' || name === 'xmlns' || name.startsWith('xmlns:')) continue
    if (++count > MAX_ATTRIBUTES) throw new XmlError('too many attributes')
    out[localName(name)] = decodeEntities(value)
  }
  return out
}

/** End of a tag that starts at `from` (the `<`), honouring quoted attribute values that may contain `>`. */
const tagEnd = (xml: string, from: number) => {
  let quote = ''
  const last = Math.min(xml.length, from + MAX_TAG_LENGTH)
  for (let i = from + 1; i < last; i++) {
    const c = xml[i]
    if (quote !== '') {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
  }
  if (last < xml.length) throw new XmlError('tag too long')
  return -1
}

export const readXml = (xml: string, handler: XmlHandler) => {
  let at = xml.indexOf('<')
  let depth = 0
  while (at >= 0) {
    if (xml.startsWith('<!--', at)) {
      const end = xml.indexOf('-->', at + 4)
      if (end < 0) throw new XmlError('unterminated comment')
      at = xml.indexOf('<', end + 3)
      continue
    }
    if (xml.startsWith('<![CDATA[', at)) {
      const end = xml.indexOf(']]>', at + 9)
      if (end < 0) throw new XmlError('unterminated CDATA')
      at = xml.indexOf('<', end + 3)
      continue
    }
    if (xml.startsWith('<?', at) || xml.startsWith('<!', at)) {
      const end = xml.indexOf('>', at + 2)
      if (end < 0) throw new XmlError('unterminated declaration')
      at = xml.indexOf('<', end + 1)
      continue
    }
    const end = tagEnd(xml, at)
    if (end < 0) throw new XmlError('unterminated tag')
    if (xml[at + 1] === '/') {
      depth--
      if (depth < 0) throw new XmlError('unbalanced end tag')
      handler.close?.(localName(xml.slice(at + 2, end).trim()))
    } else {
      const selfClosing = xml[end - 1] === '/'
      const body = xml.slice(at + 1, selfClosing ? end - 1 : end)
      const space = body.search(/[\s]/)
      const name = space < 0 ? body : body.slice(0, space)
      if (name === '') throw new XmlError('empty tag name')
      handler.open(localName(name), space < 0 ? {} : parseAttributes(body.slice(space)), selfClosing)
      if (selfClosing) handler.close?.(localName(name))
      else depth++
    }
    at = xml.indexOf('<', end + 1)
  }
  if (depth !== 0) throw new XmlError('unclosed element')
}
