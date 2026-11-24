import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { type FindUserByEmail, googleUserInfo } from './googleProfile'

const token = (claims: unknown) => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
const noUser: FindUserByEmail = () => Effect.succeed(Option.none())
const user = (emailVerified: boolean): FindUserByEmail => () => Effect.succeed(Option.some({ emailVerified }))
const claims = { sub: 'g1', email: 'Ada@Example.com', email_verified: true, name: 'Ada', picture: 'https://p.test/a.png' }

describe('googleUserInfo', () => {
  it.effect('maps a verified profile with a lowercase email', () =>
    Effect.gen(function* () {
      const info = yield* googleUserInfo(token(claims), noUser)
      assert.deepStrictEqual(info?.user, { id: 'g1', name: 'Ada', email: 'ada@example.com', image: 'https://p.test/a.png', emailVerified: true })
    }),
  )

  it.effect('accepts the string "true" Google sometimes sends', () =>
    Effect.gen(function* () {
      assert.isNotNull(yield* googleUserInfo(token({ ...claims, email_verified: 'true' }), noUser))
    }),
  )

  it.effect('refuses unverified Google emails, malformed tokens and missing tokens', () =>
    Effect.gen(function* () {
      for (const t of [token({ ...claims, email_verified: false }), token({ ...claims, email_verified: 'false' }), token({ sub: 'x' }), 'not-a-jwt', 'a.%%%.c', undefined, '']) {
        assert.isNull(yield* googleUserInfo(t, noUser))
      }
    }),
  )

  it.effect('refuses when an account with that email exists unverified, allows when it is verified', () =>
    Effect.gen(function* () {
      assert.isNull(yield* googleUserInfo(token(claims), user(false)))
      assert.isNotNull(yield* googleUserInfo(token(claims), user(true)))
    }),
  )

  it.effect('refuses (fails closed) when the user lookup errors', () =>
    Effect.gen(function* () {
      assert.isNull(yield* googleUserInfo(token(claims), () => Effect.fail(new Error('D1 down'))))
    }),
  )
})
