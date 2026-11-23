import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Redacted } from 'effect'
import { decodeEnv } from './AppConfig.live'

const base = {
  SITE_URL: 'https://viz-cad.com',
  EMAIL_FROM: 'noreply@viz-cad.com',
  EMAIL_FROM_NAME: 'VizCad',
  TURNSTILE_SECRET: 'turnstile-secret',
  // Bindings sit in the same env object and must be ignored.
  vizcad_auth: {},
  R2_FILES_BUCKET: {},
}

const r2 = { R2_ACCOUNT_ID: 'acc123', R2_ACCESS_KEY_ID: 'key-id', R2_SECRET_ACCESS_KEY: 'r2-secret-value' }

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

  it.effect('derives the R2 endpoint from the account and defaults the bucket, as the old app did', () =>
    Effect.gen(function* () {
      const presign = Option.getOrThrow((yield* decodeEnv({ ...base, ...r2 })).r2Presign)
      assert.strictEqual(presign.endpoint.href, 'https://acc123.r2.cloudflarestorage.com/')
      assert.strictEqual(presign.bucketName, 'vizcad-files-bucket')
      assert.strictEqual(Redacted.value(presign.secretAccessKey), 'r2-secret-value')
      assert.notInclude(String(presign.secretAccessKey), 'r2-secret-value')

      const custom = Option.getOrThrow(
        (yield* decodeEnv({ ...base, ...r2, R2_ENDPOINT: 'https://eu.r2.example', R2_BUCKET_NAME: 'dev-bucket' })).r2Presign,
      )
      assert.strictEqual(custom.endpoint.origin, 'https://eu.r2.example')
      assert.strictEqual(custom.bucketName, 'dev-bucket')
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
      assert.include((yield* failure({ ...base, CF_ZONE_ID: 'zone' })).message, 'Cache purge')
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
