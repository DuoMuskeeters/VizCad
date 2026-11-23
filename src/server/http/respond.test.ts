import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Logger, References } from 'effect'
import { CaptchaFailed, ConfigError, DbError, StorageError, ValidationError } from '../errors'
import { Turnstile, test as TurnstileTest } from '../services/Turnstile'
import { handle, type RequestMeta } from './respond'

const meta: RequestMeta = { requestId: 'ray-123' }
const body = (response: Response) => Effect.promise(() => response.json())

/** Captures every log line (message, annotations, cause) as JSON, the way a log sink would see it. */
const captureLogs = () => {
  const lines: Array<string> = []
  const logger = Logger.make(({ message, logLevel, cause, fiber }) => {
    lines.push(JSON.stringify({ message, logLevel, cause: String(cause), annotations: fiber.getRef(References.CurrentLogAnnotations) }))
  })
  return { lines, layer: Logger.layer([logger]) }
}

describe('handle', () => {
  it.effect('passes a successful response through', () =>
    Effect.gen(function* () {
      const response = yield* handle(
        Turnstile.use((t) => t.verify({ token: 'ok', action: 'signup', ip: null })).pipe(Effect.as(Response.json({ ok: true }))),
        TurnstileTest,
        meta,
      )
      assert.strictEqual(response.status, 200)
    }),
  )

  it.effect.each([
    { error: new ValidationError({ message: 'bad' }), status: 400 },
    { error: new CaptchaFailed({ reason: 'rejected' }), status: 403 },
    { error: new StorageError({ operation: 'get', key: 'user_1/secret-file.step', cause: 'boom' }), status: 500 },
  ])('maps $error._tag to $status and hides details', ({ error, status }) =>
    Effect.gen(function* () {
      const response = yield* handle(Effect.fail(error), Layer.empty, meta)
      assert.strictEqual(response.status, status)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: error._tag })
      assert.strictEqual(response.headers.get('cache-control'), 'no-store')
    }),
  )

  it.effect('a layer that fails to build (bad config) becomes a 500', () =>
    Effect.gen(function* () {
      const broken = Layer.effect(Turnstile, Effect.fail(new ConfigError({ message: 'TURNSTILE_SECRET missing' })))
      const response = yield* handle(Turnstile.use(() => Effect.succeed(new Response('unreachable'))), broken, meta)
      assert.strictEqual(response.status, 500)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: 'ConfigError' })
    }),
  )

  it.effect('logs only tag, operation and request id; never payloads', () => {
    const logs = captureLogs()
    const secrets = ['hunter2-sql-param', 'user_1/Gizli Teklif.step', 'r2-secret-value', 'TURNSTILE_SECRET=abc']
    return Effect.gen(function* () {
      const failures = [
        new DbError({ cause: new Error(`Failed query: select * from account where password = ? params: ${secrets[0]}`) }),
        new StorageError({ operation: 'put', key: secrets[1] ?? '', cause: new Error(secrets[2]) }),
        new ConfigError({ message: secrets[3] ?? '' }),
      ]
      for (const error of failures) yield* handle(Effect.fail(error), Layer.empty, meta)

      assert.strictEqual(logs.lines.length, 3)
      const all = logs.lines.join('\n')
      for (const secret of secrets) assert.notInclude(all, secret)
      assert.deepInclude(JSON.parse(logs.lines[1] ?? '{}').annotations, { error: 'StorageError', operation: 'put', requestId: 'ray-123' })
    }).pipe(Effect.provide(logs.layer))
  })

  it.effect('a defect becomes a fixed 500 and logs no message or stack', () => {
    const logs = captureLogs()
    return Effect.gen(function* () {
      const response = yield* handle(Effect.die(new Error('secret-in-stack')), Layer.empty, meta)
      assert.strictEqual(response.status, 500)
      assert.deepStrictEqual(yield* body(response), { ok: false, error: 'InternalError' })
      assert.notInclude(logs.lines.join('\n'), 'secret-in-stack')
    }).pipe(Effect.provide(logs.layer))
  })
})
