import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { AppConfig } from './AppConfig'
import { liveLayers } from './live'

const vars = {
  SITE_URL: 'https://vizcad.test',
  EMAIL_FROM: 'noreply@vizcad.test',
  EMAIL_FROM_NAME: 'VizCad',
  TURNSTILE_SECRET: 'turnstile-secret',
  R2_BUCKET_NAME: 'vizcad-files-test',
}
const envOf = (extra: Record<string, unknown> = {}) => ({ ...vars, ...extra }) as unknown as Cloudflare.Env
const configOf = (env: Cloudflare.Env) => AppConfig.use((config) => Effect.succeed(config)).pipe(Effect.provide(liveLayers(env).config))

describe('liveLayers (once per isolate)', () => {
  it.effect('the same env gets one built config; each request reuses it', () =>
    Effect.gen(function* () {
      const env = envOf()
      const first = yield* configOf(env)
      const second = yield* configOf(env)
      assert.strictEqual(first, second, 'decoded once')
      assert.strictEqual(liveLayers(env), liveLayers(env))
    }),
  )

  it.effect('a different env object is built again', () =>
    Effect.gen(function* () {
      const a = yield* configOf(envOf())
      const b = yield* configOf(envOf({ SITE_URL: 'https://other.test' }))
      assert.notStrictEqual(a, b)
      assert.strictEqual(b.siteUrl.origin, 'https://other.test')
    }),
  )

  it.effect('a failed build is not kept: the next request tries again', () =>
    Effect.gen(function* () {
      const env = envOf({ SITE_URL: 'not a url' }) as unknown as Record<string, unknown>
      const failed = yield* configOf(env as unknown as Cloudflare.Env).pipe(Effect.flip)
      assert.strictEqual(failed._tag, 'ConfigError')
      env['SITE_URL'] = 'https://vizcad.test'
      assert.strictEqual((yield* configOf(env as unknown as Cloudflare.Env)).siteUrl.origin, 'https://vizcad.test')
    }),
  )
})
