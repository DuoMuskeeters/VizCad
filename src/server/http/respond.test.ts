import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { CaptchaFailed, ConfigError, StorageError, ValidationError } from '../errors'
import { Turnstile, test as TurnstileTest } from '../services/Turnstile'
import { run } from './respond'

const body = (response: Response) => Effect.promise(() => response.json())

describe('run', () => {
  it.effect('passes a successful response through', () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        run(
          Turnstile.use((t) => t.verify({ token: 'ok', action: 'signup', ip: null })).pipe(Effect.as(Response.json({ ok: true }))),
          TurnstileTest,
        ),
      )
      assert.strictEqual(response.status, 200)
    }),
  )

  it.effect.each([
    [new ValidationError({ message: 'bad' }), 400],
    [new CaptchaFailed({ reason: 'rejected' }), 403],
    [new StorageError({ operation: 'get', key: 'user_1/secret-file.step', cause: 'boom' }), 500],
  ] as const)('maps %s to its status and hides details', ([error, status]) =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() => run(Effect.fail(error), Layer.empty))
      assert.strictEqual(response.status, status)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: error._tag })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )

  it.effect('a layer that fails to build (bad config) becomes a 500', () =>
    Effect.gen(function* () {
      const broken = Layer.effect(Turnstile, Effect.fail(new ConfigError({ message: 'TURNSTILE_SECRET missing' })))
      const response = yield* Effect.promise(() => run(Turnstile.use(() => Effect.succeed(new Response('unreachable'))), broken))
      assert.strictEqual(response.status, 500)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: 'ConfigError' })
    }),
  )
})
