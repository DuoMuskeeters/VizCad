/**
 * `decodeURIComponent` that never throws (CLAUDE.md: no try/catch in server code). It throws `URIError` on a malformed
 * escape (`%G1`, `%`) and on escapes that are not UTF-8 (`%FF`, a cut sequence such as `%E2%82`). Both are null here:
 * the bytes are decoded leniently and any replacement character (U+FFFD) in the result rejects the value, which also
 * rejects a literal U+FFFD or a lone surrogate. Used for R2 keys in blog image URLs, where null means "not a key".
 */
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })
const ESCAPE = /^[0-9a-fA-F]{2}$/
const REPLACEMENT = '�'

export const decodeComponent = (value: string): string | null => {
  const bytes: Array<number> = []
  for (let i = 0; i < value.length; ) {
    if (value[i] === '%') {
      const hex = value.slice(i + 1, i + 3)
      if (!ESCAPE.test(hex)) return null
      bytes.push(Number.parseInt(hex, 16))
      i += 3
      continue
    }
    // One code point (a surrogate pair stays together; a lone surrogate encodes as U+FFFD and is rejected below).
    const ch = String.fromCodePoint(value.codePointAt(i) ?? 0)
    for (const byte of encoder.encode(ch)) bytes.push(byte)
    i += ch.length
  }
  const decoded = decoder.decode(Uint8Array.from(bytes))
  return decoded.includes(REPLACEMENT) ? null : decoded
}
