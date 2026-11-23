import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Redacted } from 'effect'
import { decodeEnv } from './AppConfig.live'
import { presign } from './r2Presign'

const base = {
  SITE_URL: 'https://viz-cad.com',
  EMAIL_FROM: 'noreply@viz-cad.com',
  EMAIL_FROM_NAME: 'VizCad',
  TURNSTILE_SECRET: 'turnstile-secret',
  R2_BUCKET_NAME: 'vizcad-files-staging',
  // Bindings sit in the same env object and must be ignored.
  vizcad_auth: {},
  R2_FILES_BUCKET: {},
}

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const r2 = { R2_ACCOUNT_ID: ACCOUNT, R2_ACCESS_KEY_ID: 'key-id', R2_SECRET_ACCESS_KEY: 'r2-secret-value' }

const failure = (env: Record<string, unknown>) => decodeEnv(env).pipe(Effect.flip)

describe('AppConfig.fromEnv', () => {
  it.effect('decodes the minimal env; optional groups are off', () =>
    Effect.gen(function* () {
      const config = yield* decodeEnv(base)
      assert.strictEqual(config.siteUrl.href, 'https://viz-cad.com/')
      assert.deepStrictEqual(config.email, { from: 'noreply@viz-cad.com', fromName: 'VizCad' })
      assert.strictEqual(Redacted.value(config.turnstile.secret), 'turnstile-secret')
      assert.deepStrictEqual([...config.turnstile.hostnames], ['viz-cad.com'])
      assert.isTrue(Option.isNone(config.r2Presign))
      assert.isTrue(Option.isNone(config.cachePurge))
    }),
  )

  it.effect('derives the R2 endpoint from the account, as the old app did', () =>
    Effect.gen(function* () {
      const presign = Option.getOrThrow((yield* decodeEnv({ ...base, ...r2 })).r2Presign)
      assert.strictEqual(presign.endpoint.href, `https://${ACCOUNT}.r2.cloudflarestorage.com/`)
      assert.strictEqual(presign.bucketName, 'vizcad-files-staging')
      assert.strictEqual(Redacted.value(presign.secretAccessKey), 'r2-secret-value')
      assert.notInclude(String(presign.secretAccessKey), 'r2-secret-value')

      const custom = Option.getOrThrow(
        (yield* decodeEnv({ ...base, ...r2, R2_ENDPOINT: 'https://eu.r2.example', R2_BUCKET_NAME: 'dev-bucket' })).r2Presign,
      )
      assert.strictEqual(custom.endpoint.origin, 'https://eu.r2.example')
      assert.strictEqual(custom.bucketName, 'dev-bucket')
    }),
  )

  it.effect('requires R2_BUCKET_NAME: there is no production default to fall back on', () =>
    Effect.gen(function* () {
      const { R2_BUCKET_NAME: _, ...withoutBucket } = base
      assert.strictEqual((yield* failure(withoutBucket))._tag, 'ConfigError')
      assert.strictEqual((yield* failure({ ...withoutBucket, ...r2 }))._tag, 'ConfigError')
      assert.strictEqual((yield* failure({ ...base, R2_BUCKET_NAME: '' }))._tag, 'ConfigError')
      assert.strictEqual((yield* failure({ ...base, R2_BUCKET_NAME: 'Not_A_Bucket' }))._tag, 'ConfigError')
    }),
  )

  it.effect('staging presigns for the staging bucket, never production', () =>
    Effect.gen(function* () {
      const config = yield* decodeEnv({ ...base, ...r2 })
      const url = yield* presign(Option.getOrThrow(config.r2Presign), { method: 'PUT', key: 'u/f/a.stl', expiresInSeconds: 60 })
      assert.strictEqual(url.pathname, '/vizcad-files-staging/u/f/a.stl')
    }),
  )

  it.effect('blank values count as unset (an untouched .dev.vars line)', () =>
    Effect.gen(function* () {
      const config = yield* decodeEnv({ ...base, R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: ' ', R2_SECRET_ACCESS_KEY: '', CF_ZONE_ID: '' })
      assert.isTrue(Option.isNone(config.r2Presign))
      assert.isTrue(Option.isNone(config.cachePurge))
    }),
  )

  it.effect('validates the account id and URL protocols with ConfigError, never a TypeError', () =>
    Effect.gen(function* () {
      for (const env of [
        { ...base, ...r2, R2_ACCOUNT_ID: 'bad host/../x' },
        { ...base, ...r2, R2_ACCOUNT_ID: 'ACC123' },
        { ...base, ...r2, R2_ENDPOINT: 'http://insecure.example' },
        { ...base, SITE_URL: 'ftp://viz-cad.com' },
        { ...base, SITE_URL: 'javascript:alert(1)' },
        { ...base, CF_ZONE_ID: 'zone', CF_PURGE_TOKEN: 't' },
      ]) {
        assert.strictEqual((yield* failure(env))._tag, 'ConfigError')
      }
      assert.strictEqual((yield* decodeEnv({ ...base, SITE_URL: 'http://localhost:3000' })).siteUrl.port, '3000')
    }),
  )

  it.effect('parses TURNSTILE_HOSTNAMES', () =>
    Effect.gen(function* () {
      const config = yield* decodeEnv({ ...base, TURNSTILE_HOSTNAMES: ' localhost, 127.0.0.1 ,,Viz-CAD.com ' })
      assert.deepStrictEqual([...config.turnstile.hostnames], ['localhost', '127.0.0.1', 'viz-cad.com'])
    }),
  )

  it.effect('half-configured groups fail instead of silently turning a feature off', () =>
    Effect.gen(function* () {
      assert.include((yield* failure({ ...base, R2_ACCESS_KEY_ID: 'key-id' })).message, 'R2 presign')
      assert.include((yield* failure({ ...base, CF_ZONE_ID: ACCOUNT })).message, 'Cache purge')
    }),
  )

  it.effect('missing or malformed values fail with ConfigError without echoing secrets', () =>
    Effect.gen(function* () {
      const { TURNSTILE_SECRET: _, ...withoutSecret } = base
      assert.strictEqual((yield* failure(withoutSecret))._tag, 'ConfigError')
      assert.strictEqual((yield* failure({ ...base, EMAIL_FROM: 'VizCad <noreply@viz-cad.com>' }))._tag, 'ConfigError')
      const error = yield* failure({ ...base, ...r2, SITE_URL: 'not a url' })
      assert.strictEqual(error._tag, 'ConfigError')
      assert.notInclude(error.message, 'r2-secret-value')
      assert.notInclude(error.message, 'turnstile-secret')
    }),
  )
})
