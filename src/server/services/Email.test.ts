import { assert, describe, it, layer } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import * as AppConfig from './AppConfig'
import { Email, EmailOutbox, memory } from './Email'
import * as EmailLive from './Email.live'

const welcome = { to: 'ada@example.com', subject: 'Verify your VizCad account', text: 'Hi Ada', html: '<p>Hi Ada</p>' }

layer(memory)('Email (in-memory)', (it) => {
  it.effect('records sent messages in order', () =>
    Effect.gen(function* () {
      const email = yield* Email
      const first = yield* email.send(welcome)
      yield* email.send({ ...welcome, to: 'lin@example.com' })
      const sent = yield* Ref.get(yield* EmailOutbox)
      assert.strictEqual(first.messageId, 'msg-1')
      assert.deepStrictEqual(
        sent.map((m) => m.to),
        ['ada@example.com', 'lin@example.com'],
      )
    }),
  )

  it.effect('fails for @fail.test recipients and line breaks in headers', () =>
    Effect.gen(function* () {
      const email = yield* Email
      const before = (yield* Ref.get(yield* EmailOutbox)).length
      assert.strictEqual((yield* email.send({ ...welcome, to: 'x@fail.test' }).pipe(Effect.flip))._tag, 'EmailError')
      assert.strictEqual((yield* email.send({ ...welcome, subject: 'Hi\r\nBcc: x@evil.test' }).pipe(Effect.flip))._tag, 'EmailError')
      assert.strictEqual((yield* Ref.get(yield* EmailOutbox)).length, before)
    }),
  )
})

describe('Email.live', () => {
  const fakeBinding = (calls: Array<unknown>, fail = false) =>
    ({
      send: (message: unknown) => {
        calls.push(message)
        return fail ? Promise.reject(new Error('E_SENDER_NOT_VERIFIED')) : Promise.resolve({ messageId: 'cf-1' })
      },
    }) as SendEmail

  it.effect('sends from the configured address through the binding', () => {
    const calls: Array<unknown> = []
    return Effect.gen(function* () {
      const email = yield* Email
      const result = yield* email.send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' })
      assert.strictEqual(result.messageId, 'cf-1')
      assert.deepStrictEqual(calls, [
        { from: { name: 'VizCad', email: 'noreply@vizcad.test' }, to: 'ada@example.com', subject: 'Hi', text: 'Hello' },
      ])
    }).pipe(Effect.provide(EmailLive.layer(fakeBinding(calls)).pipe(Layer.provide(AppConfig.test()))))
  })

  it.effect('maps binding errors to EmailError and never calls it with injected headers', () => {
    const calls: Array<unknown> = []
    return Effect.gen(function* () {
      const email = yield* Email
      assert.strictEqual((yield* email.send(welcome).pipe(Effect.flip))._tag, 'EmailError')
      yield* email.send({ ...welcome, to: 'a@example.com\nBcc: b@example.com' }).pipe(Effect.flip)
      assert.strictEqual(calls.length, 1)
    }).pipe(Effect.provide(EmailLive.layer(fakeBinding(calls, true)).pipe(Layer.provide(AppConfig.test()))))
  })
})
