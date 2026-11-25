import { Effect, Layer, Option, Redacted, Schema } from 'effect'
import { ConfigError } from '../errors'
import { fromBase64Url } from '../shareCrypto'
import { AppConfig, type AuthSettings, type CachePurge, defaultRateLimits, type R2Presign, type ShareTokenKeys } from './AppConfig'

const Text = Schema.Trimmed.check(Schema.isMinLength(1))
const optionalText = Schema.optional(Text)
const Hex32 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/))

const HttpUrl = Schema.URLFromString.check(
  Schema.makeFilter((url: URL) => url.protocol === 'https:' || url.protocol === 'http:' || 'must be an http(s) URL'),
)
const HttpsUrl = Schema.URLFromString.check(Schema.makeFilter((url: URL) => url.protocol === 'https:' || 'must be an https URL'))

/** S3 bucket naming rules (R2 follows them). */
const BucketName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/))

/** Worker vars and secrets this app reads. Names of old secrets are kept (see wrangler.jsonc). */
const EnvSchema = Schema.Struct({
  SITE_URL: HttpUrl,
  EMAIL_FROM: Schema.String.check(Schema.isPattern(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/)),
  EMAIL_FROM_NAME: Text,
  TURNSTILE_SECRET: Text,
  /** Comma-separated; defaults to the SITE_URL hostname. */
  TURNSTILE_HOSTNAMES: Schema.optional(Schema.String),
  /**
   * Required in every environment, with no default: it must name the bucket the R2_FILES_BUCKET binding
   * points to, or presigned URLs would address a different bucket. Staging: a var in wrangler.jsonc.
   * Production: the existing `R2_BUCKET_NAME` secret.
   */
  R2_BUCKET_NAME: BucketName,
  R2_ACCOUNT_ID: Schema.optional(Hex32),
  R2_ACCESS_KEY_ID: optionalText,
  R2_SECRET_ACCESS_KEY: optionalText,
  R2_ENDPOINT: Schema.optional(HttpsUrl),
  CF_ZONE_ID: Schema.optional(Hex32),
  CF_PURGE_TOKEN: optionalText,
  /** Set by wrangler.jsonc: `staging` for the top level, `production` for env.production. Unset (local dev) behaves like staging only if EMAIL_ALLOWLIST is set. */
  APP_ENV: Schema.optional(Schema.Literals(['staging', 'production'])),
  /** Comma-separated recipients (addresses or `@domain`) staging may email. Staging without it emails nobody. Ignored in production. */
  EMAIL_ALLOWLIST: Schema.optional(Schema.String),
  /** Comma-separated extra origins (e.g. http://localhost:3000) trusted for state-changing requests. */
  TRUSTED_ORIGINS: Schema.optional(Schema.String),
  /** Min 32 characters; production keeps the old app's secret so existing sessions survive. */
  BETTER_AUTH_SECRET: Schema.optional(Schema.String.check(Schema.isMinLength(32))),
  /** `1` rewrites legacy scrypt login hashes as PBKDF2 on sign-in; `0` or unset leaves them (production until the cutover). */
  PASSWORD_REHASH: Schema.optional(Schema.Literals(['0', '1'])),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  /** JSON `{"<version>": "<base64 of 32 bytes>"}`; the highest version is the active one (docs/09 §4.1). */
  SHARE_TOKEN_KEYS: optionalText,
  /** Base64 of at least 32 random bytes (`openssl rand -base64 32`). */
  SHARE_PROOF_KEY: optionalText,
  /** Unix seconds; trash retention counts from at least this time (legacy trash at cutover). Unset means 0. */
  TRASH_RETENTION_FLOOR: Schema.optional(Schema.String.check(Schema.isPattern(/^\d{1,12}$/))),
})
type Env = typeof EnvSchema.Type

/** Empty or blank values count as unset, so an untouched `.dev.vars` line does not break decoding. */
const withoutBlanks = (env: object) =>
  Object.fromEntries(Object.entries(env).filter(([, value]) => !(typeof value === 'string' && value.trim() === '')))

/**
 * Each optional group is all-or-nothing: a half-configured group is a deploy mistake, so it fails
 * loudly instead of silently disabling the feature.
 */
const partial = (name: string) => Effect.fail(new ConfigError({ message: `${name}: set all of its variables or none` }))

const r2Presign = (e: Env) => {
  const { R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secret } = e
  // Endpoint defaults to the account's S3 endpoint, as in the old app.
  const endpoint =
    e.R2_ENDPOINT ?? (e.R2_ACCOUNT_ID ? new URL(`https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`) : undefined)
  if (endpoint && accessKeyId && secret) {
    return Effect.succeed(
      Option.some({
        endpoint,
        bucketName: e.R2_BUCKET_NAME,
        accessKeyId,
        secretAccessKey: Redacted.make(secret),
      }),
    )
  }
  if (!endpoint && !accessKeyId && !secret) return Effect.succeed(Option.none<R2Presign>())
  return partial('R2 presign (R2_ACCOUNT_ID or R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
}

const cachePurge = (e: Env) => {
  const { CF_ZONE_ID: zoneId, CF_PURGE_TOKEN: token } = e
  if (zoneId && token) return Effect.succeed(Option.some({ zoneId, token: Redacted.make(token) }))
  if (!zoneId && !token) return Effect.succeed(Option.none<CachePurge>())
  return partial('Cache purge (CF_ZONE_ID, CF_PURGE_TOKEN)')
}

const badKeys = (name: string, why: string) => Effect.fail(new ConfigError({ message: `${name}: ${why}` }))

const KeyRingJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String))

/** `{"1": "<base64 32 bytes>", "2": ...}`; versions are positive integers, the highest one is active (docs/09 §4.1). */
const shareTokenKeys = (e: Env) =>
  Effect.gen(function* () {
    if (e.SHARE_TOKEN_KEYS === undefined) return Option.none<ShareTokenKeys>()
    const ring = yield* Schema.decodeUnknownEffect(KeyRingJson)(e.SHARE_TOKEN_KEYS).pipe(
      Effect.catch(() => badKeys('SHARE_TOKEN_KEYS', 'must be a JSON object of version to base64 key')),
    )
    const keys = new Map<number, Redacted.Redacted<Uint8Array>>()
    for (const [version, value] of Object.entries(ring)) {
      const bytes = fromBase64Url(value)
      if (!/^[1-9]\d{0,5}$/.test(version) || bytes === undefined || bytes.byteLength !== 32) {
        return yield* badKeys('SHARE_TOKEN_KEYS', 'every entry must be "<version>": "<base64 of 32 bytes>"')
      }
      keys.set(Number(version), Redacted.make(bytes))
    }
    const active = Math.max(0, ...keys.keys())
    if (active === 0) return yield* badKeys('SHARE_TOKEN_KEYS', 'needs at least one key')
    return Option.some<ShareTokenKeys>({ active, keys })
  })

const shareProofKey = (e: Env) => {
  if (e.SHARE_PROOF_KEY === undefined) return Effect.succeed(Option.none<Redacted.Redacted<Uint8Array>>())
  const bytes = fromBase64Url(e.SHARE_PROOF_KEY.trim())
  return bytes === undefined || bytes.byteLength < 32
    ? badKeys('SHARE_PROOF_KEY', 'must be base64 of at least 32 bytes')
    : Effect.succeed(Option.some(Redacted.make(bytes)))
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0)

/** Production never restricts recipients. Staging always does (no variable = nobody). Unset (local) restricts only when asked. */
const emailAllowlist = (e: Env) => {
  if (e.APP_ENV === 'production') return Option.none<ReadonlySet<string>>()
  if (e.APP_ENV === 'staging' || e.EMAIL_ALLOWLIST !== undefined) return Option.some<ReadonlySet<string>>(new Set(list(e.EMAIL_ALLOWLIST)))
  return Option.none<ReadonlySet<string>>()
}

const trustedOrigins = (e: Env) =>
  Effect.forEach(list(e.TRUSTED_ORIGINS), (origin) =>
    Schema.decodeUnknownEffect(HttpUrl)(origin).pipe(
      Effect.map((url) => url.origin),
      Effect.mapError(() => new ConfigError({ message: 'TRUSTED_ORIGINS: every entry must be an http(s) URL' })),
    ),
  ).pipe(Effect.map((extra) => new Set([e.SITE_URL.origin, ...extra]) as ReadonlySet<string>))

const authSettings = (e: Env) => {
  const rehashPasswords = e.PASSWORD_REHASH === '1'
  const { BETTER_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = e
  if (!secret) {
    return clientId || clientSecret
      ? partial('Auth (BETTER_AUTH_SECRET is required when Google is configured)')
      : Effect.succeed(Option.none<AuthSettings>())
  }
  if (clientId && clientSecret) {
    return Effect.succeed(
      Option.some<AuthSettings>({
        secret: Redacted.make(secret),
        rehashPasswords,
        google: Option.some({ clientId, clientSecret: Redacted.make(clientSecret) }),
      }),
    )
  }
  if (!clientId && !clientSecret) {
    return Effect.succeed(Option.some<AuthSettings>({ secret: Redacted.make(secret), rehashPasswords, google: Option.none() }))
  }
  return partial('Google sign-in (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)')
}

/** Decodes the Worker `env` (or a plain object in tests) into AppConfig; bindings in it are ignored. */
export const decodeEnv = Effect.fnUntraced(function* (env: object) {
  const e = yield* Schema.decodeUnknownEffect(EnvSchema)(withoutBlanks(env)).pipe(
    Effect.mapError((issue) => new ConfigError({ message: String(issue) })),
  )
  return AppConfig.of({
    siteUrl: e.SITE_URL,
    email: { from: e.EMAIL_FROM, fromName: e.EMAIL_FROM_NAME, allowlist: emailAllowlist(e) },
    trustedOrigins: yield* trustedOrigins(e),
    auth: yield* authSettings(e),
    rateLimits: defaultRateLimits,
    turnstile: {
      secret: Redacted.make(e.TURNSTILE_SECRET),
      hostnames: new Set(
        (e.TURNSTILE_HOSTNAMES?.trim() || e.SITE_URL.hostname)
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter((h) => h.length > 0),
      ),
    },
    r2Presign: yield* r2Presign(e),
    cachePurge: yield* cachePurge(e),
    shareTokenKeys: yield* shareTokenKeys(e),
    shareProofKey: yield* shareProofKey(e),
    securityLogRetentionDays: 90,
    trashRetentionFloor: e.TRASH_RETENTION_FLOOR === undefined ? 0 : Number(e.TRASH_RETENTION_FLOOR),
  })
})

export const fromEnv = (env: object) => Layer.effect(AppConfig, decodeEnv(env))
