import { Effect, Layer, Option, Redacted, Schema } from 'effect'
import { ConfigError } from '../errors'
import { AppConfig, type CachePurge, type R2Presign } from './AppConfig'

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

/** Decodes the Worker `env` (or a plain object in tests) into AppConfig; bindings in it are ignored. */
export const decodeEnv = Effect.fnUntraced(function* (env: object) {
  const e = yield* Schema.decodeUnknownEffect(EnvSchema)(withoutBlanks(env)).pipe(
    Effect.mapError((issue) => new ConfigError({ message: String(issue) })),
  )
  return AppConfig.of({
    siteUrl: e.SITE_URL,
    email: { from: e.EMAIL_FROM, fromName: e.EMAIL_FROM_NAME },
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
  })
})

export const fromEnv = (env: object) => Layer.effect(AppConfig, decodeEnv(env))
