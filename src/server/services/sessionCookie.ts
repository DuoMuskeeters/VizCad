/**
 * Reads better-auth's signed session cookie without the SDK (docs/08 §1). Mirrors better-call's `getSignedCookie`:
 * the cookie value is `<token>.<base64 HMAC-SHA256 signature>` (signature 44 characters, ends with `=`), URL-encoded once.
 * No `effect` and no SDK imports: this runs on every app API request and the SDK stays out of that path.
 * Functions resolve to null/false instead of throwing; Auth.live.ts wraps them in Effect.
 */

/** Session lifetime and refresh interval (seconds). authOptions.ts uses the same values. */
export const SESSION_EXPIRES_IN = 60 * 60 * 24 * 30
export const SESSION_UPDATE_AGE = 60 * 60 * 24

const BASE = 'better-auth'
export const sessionCookieName = (secure: boolean) => `${secure ? '__Secure-' : ''}${BASE}.session_token`
export const dontRememberCookieName = (secure: boolean) => `${secure ? '__Secure-' : ''}${BASE}.dont_remember`

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const algorithm = { name: 'HMAC', hash: 'SHA-256' } as const

/** Percent-decoding without `decodeURIComponent` (it throws on malformed escapes): a malformed escape is kept as is. */
const decodeValue = (value: string): string => {
  if (!value.includes('%')) return value
  const bytes: number[] = []
  for (let i = 0; i < value.length; i += 1) {
    const hex = value.slice(i + 1, i + 3)
    if (value[i] === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16))
      i += 2
    } else bytes.push(...encoder.encode(value[i] ?? ''))
  }
  return decoder.decode(new Uint8Array(bytes))
}

/** A cookie's value from a `Cookie` header (first match wins, one layer of quotes and percent-encoding removed). */
export const readCookie = (header: string | null, name: string): string | undefined => {
  if (header === null) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue
    let value = part.slice(eq + 1).trim()
    if (value.codePointAt(0) === 34) value = value.slice(1, -1)
    return decodeValue(value)
  }
  return undefined
}

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) return null
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), algorithm, false, ['sign', 'verify'])

/**
 * The signed value (the session token) when the cookie's signature is valid, otherwise null (absent, unsigned or forged).
 * `crypto.subtle.verify` compares in constant time.
 */
export const verifySignedCookie = async (raw: string | undefined, secret: string): Promise<string | null> => {
  if (raw === undefined || raw === '') return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const value = raw.slice(0, dot)
  const signature = fromBase64(raw.slice(dot + 1))
  if (signature === null) return null
  const key = await hmacKey(secret)
  return (await crypto.subtle.verify(algorithm, key, signature, encoder.encode(value))) ? value : null
}

/** Test helper: the cookie value better-auth would set (`token.signature`, URL-encoded). */
export const signCookieValue = async (value: string, secret: string): Promise<string> => {
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm.name, await hmacKey(secret), encoder.encode(value)))
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`)
}
