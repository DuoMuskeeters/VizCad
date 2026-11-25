import { Effect, Option, Redacted } from 'effect'
import { ConfigError } from './errors'
import { AppConfig } from './services/AppConfig'

/**
 * Cryptography of share links (docs/09 §4). WebCrypto only; no I/O. Everything here is deterministic given its inputs
 * (apart from the random token, nonce and salt), so it is tested without a database.
 */

const encoder = new TextEncoder()

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Base64url (or base64) to bytes; undefined for anything else, checked first so `atob` never throws. */
export const fromBase64Url = (value: string): Uint8Array | undefined => {
  const bare = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]*$/.test(bare) || bare.length % 4 === 1) return undefined
  return Uint8Array.from(atob(bare.padEnd(Math.ceil(bare.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
}

/** Constant-time equality of two byte strings (lengths are public). */
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.byteLength !== b.byteLength) return false
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

// ── tokens ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A new link token: 32 CSPRNG bytes, base64url (43 characters). */
export const newToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))

/** New tokens are 43 base64url characters; legacy `Math.random` tokens are 32 alphanumerics. Anything else never reaches D1. */
export const isTokenFormat = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) || /^[A-Za-z0-9]{32}$/.test(token)

/** SHA-256 hex of the token: the lookup value stored in `share_links.tokenDigest`. */
export const tokenDigest = (token: string) =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', encoder.encode(token))).pipe(Effect.map((d) => hex(new Uint8Array(d))))

const aesKey = (key: Uint8Array, usage: 'encrypt' | 'decrypt') =>
  crypto.subtle.importKey('raw', key.slice(), 'AES-GCM', false, [usage])

const aad = (linkId: string, workspaceId: string) => encoder.encode(`${linkId}\n${workspaceId}`)

const cryptoFailed = (message: string) => new ConfigError({ message })

/** AES-GCM: `base64url(nonce(12) ‖ ciphertext+tag)`, bound to the link and workspace through the AAD (docs/09 §4.1). */
export const encryptToken = (key: Uint8Array, token: string, linkId: string, workspaceId: string) =>
  Effect.tryPromise({
    try: async () => {
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(linkId, workspaceId) },
        await aesKey(key, 'encrypt'),
        encoder.encode(token),
      )
      return toBase64Url(new Uint8Array([...nonce, ...new Uint8Array(sealed)]))
    },
    catch: () => cryptoFailed('share token encryption failed'),
  })

export const decryptToken = Effect.fnUntraced(function* (key: Uint8Array, ciphertext: string, linkId: string, workspaceId: string) {
  const bytes = fromBase64Url(ciphertext)
  if (bytes === undefined || bytes.byteLength < 12 + 16) return yield* cryptoFailed('share token ciphertext is malformed')
  return yield* Effect.tryPromise({
    try: async () => {
      const opened = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: aad(linkId, workspaceId) },
        await aesKey(key, 'decrypt'),
        bytes.slice(12),
      )
      return new TextDecoder().decode(opened)
    },
    catch: () => cryptoFailed('share token decryption failed'),
  })
})

// ── passwords ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * PBKDF2-HMAC-SHA-256, 100 000 iterations, 16-byte salt: `p1$<iterations>$<salt>$<hash>` (base64url). 100 000 is the most
 * the Workers runtime accepts. The hash only matters next to a 256-bit token that D1 holds as a digest, so an offline
 * attack on a leaked row has nothing to open; online guessing is bounded by RateLimit and Turnstile (docs/09 §4.2).
 */
export const PASSWORD_ITERATIONS = 100_000

const derive = (password: string, salt: Uint8Array, iterations: number) =>
  crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']).then((key) =>
    crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice(), iterations }, key, 256),
  ).then((bits) => new Uint8Array(bits))

export const hashPassword = (password: string) =>
  Effect.tryPromise({
    try: async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      return `p1$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(await derive(password, salt, PASSWORD_ITERATIONS))}`
    },
    catch: () => cryptoFailed('password hashing failed'),
  })

/** False for a wrong password and for a malformed or unsupported stored hash. */
export const verifyPassword = (stored: string, password: string) => {
  const [version, iterations, saltText, hashText, extra] = stored.split('$')
  const salt = saltText === undefined ? undefined : fromBase64Url(saltText)
  const expected = hashText === undefined ? undefined : fromBase64Url(hashText)
  const count = Number(iterations)
  if (version !== 'p1' || extra !== undefined || salt === undefined || expected === undefined || !Number.isInteger(count)
    || count < 1 || count > PASSWORD_ITERATIONS) {
    return Effect.succeed(false)
  }
  return Effect.tryPromise({ try: () => derive(password, salt, count), catch: () => cryptoFailed('password check failed') }).pipe(
    Effect.map((actual) => timingSafeEqual(actual, expected)),
    Effect.orElseSucceed(() => false),
  )
}

// ── HMAC: audit ids and proof cookies ───────────────────────────────────────────────────────────────────────────

const hmac = (key: Uint8Array, message: string) =>
  crypto.subtle.importKey('raw', key.slice(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then((k) =>
    crypto.subtle.sign('HMAC', k, encoder.encode(message)),
  ).then((mac) => new Uint8Array(mac))

/** Delivery audit window (docs/09 §3.4): one audit row per actor, object and purpose in ten minutes. */
export const AUDIT_WINDOW_SECONDS = 600

/**
 * `HMAC(proofKey, purpose ‖ actor ‖ fileId ‖ objectKey ‖ floor(now / 600))` as hex: the primary key of the audit rows of
 * one delivery, so `INSERT … ON CONFLICT DO NOTHING` keeps one row per window. The actor is a user id or `link:<id>`.
 */
export const auditId = (key: Uint8Array, purpose: string, actor: string, fileId: string, objectKey: string, now: number) =>
  Effect.promise(() => hmac(key, [purpose, actor, fileId, objectKey, Math.floor(now / AUDIT_WINDOW_SECONDS)].join('\n'))).pipe(
    Effect.map(hex),
  )

/** Longest a password proof lives (docs/09 §4.2). */
export const PROOF_MAX_SECONDS = 12 * 60 * 60

/** Link ids are UUIDs; anything else cannot be part of a cookie name. */
const safeLinkId = (linkId: string) => /^[A-Za-z0-9_-]{1,64}$/.test(linkId)

export const proofCookieName = (linkId: string) => (safeLinkId(linkId) ? `__Host-vizcad-share-${linkId}` : undefined)

const proofMessage = (linkId: string, revision: number, expiresAt: number) => `${linkId}\n${revision}\n${expiresAt}`

/** `v1.<expiresAt>.<mac>` where the MAC covers the link, its revision and the expiry (docs/09 §4.2). */
export const signProof = (key: Uint8Array, linkId: string, revision: number, expiresAt: number) =>
  Effect.promise(() => hmac(key, proofMessage(linkId, revision, expiresAt))).pipe(
    Effect.map((mac) => `v1.${expiresAt}.${toBase64Url(mac)}`),
  )

/** The `Set-Cookie` value of a proof; `maxAge` in seconds. `__Host-` forces Secure, Path=/ and no Domain. */
export const proofSetCookie = (linkId: string, value: string, maxAge: number) => {
  const name = proofCookieName(linkId)
  return name === undefined ? undefined : `${name}=${value}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`
}

/** The cookie `name` value in a `Cookie` header, or undefined. */
export const cookieValue = (header: string | null, name: string) => {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

export interface PasswordProof {
  readonly linkId: string
  readonly revision: number
  readonly expiresAt: number
}

/**
 * The proof the request's cookie carries for this link at its current revision, or undefined: missing, malformed, expired,
 * or a MAC that does not match (a different link, an older revision or a forged value).
 */
export const readProof = (key: Uint8Array, cookieHeader: string | null, linkId: string, revision: number, now: number) =>
  Effect.gen(function* () {
    const name = proofCookieName(linkId)
    const value = name === undefined ? undefined : cookieValue(cookieHeader, name)
    const parts = value?.split('.')
    if (parts === undefined || parts.length !== 3 || parts[0] !== 'v1' || !/^\d{1,12}$/.test(parts[1] ?? '')) return undefined
    const expiresAt = Number(parts[1])
    const given = fromBase64Url(parts[2] ?? '')
    if (given === undefined || now >= expiresAt) return undefined
    const expected = yield* Effect.promise(() => hmac(key, proofMessage(linkId, revision, expiresAt)))
    return timingSafeEqual(expected, given) ? ({ linkId, revision, expiresAt } satisfies PasswordProof) : undefined
  })

// ── keys from AppConfig ─────────────────────────────────────────────────────────────────────────────────────────

/** The HMAC key for proofs and audit ids, or ConfigError when `SHARE_PROOF_KEY` is not set. */
export const proofKey = Effect.gen(function* () {
  const { shareProofKey } = yield* AppConfig
  if (Option.isNone(shareProofKey)) return yield* new ConfigError({ message: 'SHARE_PROOF_KEY is not configured' })
  return Redacted.value(shareProofKey.value)
})

/** The token key ring, or ConfigError when `SHARE_TOKEN_KEYS` is not set. */
export const tokenKeys = Effect.gen(function* () {
  const { shareTokenKeys } = yield* AppConfig
  if (Option.isNone(shareTokenKeys)) return yield* new ConfigError({ message: 'SHARE_TOKEN_KEYS is not configured' })
  return shareTokenKeys.value
})

/** The key of one version, or ConfigError when the ring no longer holds it. */
export const tokenKeyOf = (version: number) =>
  tokenKeys.pipe(
    Effect.flatMap((ring) => {
      const key = ring.keys.get(version)
      return key === undefined ? Effect.fail(new ConfigError({ message: 'share token key version is not in SHARE_TOKEN_KEYS' })) : Effect.succeed(Redacted.value(key))
    }),
  )
