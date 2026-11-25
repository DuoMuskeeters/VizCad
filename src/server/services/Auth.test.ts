import { assert, describe, it } from '@effect/vitest'
import { hashPassword as scryptHash } from 'better-auth/crypto'
import { drizzle } from 'drizzle-orm/d1'
import { Effect, Layer, Option, Redacted, Ref } from 'effect'
import { vi } from 'vitest'
import * as schema from '../db/schema'
import { openMemoryD1, type MemoryD1 } from '../testing/memoryD1'
import * as AppConfig from './AppConfig'
import { Auth, MemoryAuth, memory } from './Auth'
import * as AuthLive from './Auth.live'
import { EmailOutbox, memory as emailMemory } from './Email'
import { authOptions, organizationFields } from './authOptions'
import { readCookie, signCookieValue, verifySignedCookie } from './sessionCookie'

const ORIGIN = 'https://vizcad.test'
const PASSWORD = 'correct-horse-battery'

/** The real SDK on an in-memory D1 with every migration, with mail captured in the Email outbox. */
const setup = (defer?: AuthLive.Defer, config: Partial<AppConfig.AppConfig['Service']> = {}) => {
  const d1: MemoryD1 = openMemoryD1()
  const layer = AuthLive.layer(d1.binding, defer).pipe(Layer.provideMerge(emailMemory), Layer.provide(AppConfig.test(config)))
  return { d1, layer }
}

const jar = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => !c.endsWith('='))
    .join('; ')

const post = (path: string, body: unknown, cookie = '') =>
  new Request(`${ORIGIN}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
const get = (path: string, cookie = '') =>
  new Request(`${ORIGIN}${path.startsWith('/') ? '' : '/api/auth/'}${path}`, { headers: cookie ? { cookie } : {} })

const handle = (request: Request) => Auth.use((a) => a.handleIdentityRequest(request))
const lastLink = Effect.gen(function* () {
  const outbox = yield* Ref.get(yield* EmailOutbox)
  const text = outbox.at(-1)?.text ?? ''
  return /https?:\/\/\S+/.exec(text)?.[0] ?? ''
})

const signUp = (email: string) => handle(post('/sign-up/email', { email, password: PASSWORD, name: 'Ada' }))
const verify = Effect.gen(function* () {
  const link = yield* lastLink
  return yield* handle(get(new URL(link).pathname + new URL(link).search))
})
const signIn = (email: string, password = PASSWORD) => handle(post('/sign-in/email', { email, password }))

const idToken = (claims: Record<string, unknown>) => {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`
}

/** Runs the Google flow end to end against a stubbed token endpoint; returns the callback response. */
const google = (claims: { sub: string; email: string; email_verified: boolean }) =>
  Effect.gen(function* () {
    const start = yield* handle(post('/sign-in/social', { provider: 'google', callbackURL: '/app', errorCallbackURL: '/sign-in' }))
    const { url } = (yield* Effect.promise(() => start.json())) as { url: string }
    const state = new URL(url).searchParams.get('state') ?? ''
    vi.stubGlobal('fetch', (input: unknown) => {
      assert.include(String(input), 'oauth2.googleapis.com/token')
      return Promise.resolve(
        Response.json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, id_token: idToken({ name: 'Ada', ...claims }) }),
      )
    })
    return yield* handle(get(`callback/google?code=abc&state=${state}`, jar(start))).pipe(Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals())))
  })

const rows = <T>(d1: MemoryD1, sql: string) => d1.sqlite.prepare(sql).all() as Array<T>

describe('Auth.live (better-auth 1.4.7 on in-memory D1)', () => {
  it.effect('mail is deferred: the response does not wait for the send', () => {
    const deferred: Array<() => Promise<void>> = []
    const { layer } = setup((run) => {
      deferred.push(run)
    })
    return Effect.gen(function* () {
      assert.strictEqual((yield* signUp('ada@example.com')).status, 200)
      assert.strictEqual(deferred.length, 1)
      assert.strictEqual((yield* Ref.get(yield* EmailOutbox)).length, 0, 'nothing sent before the deferred work runs')
      yield* Effect.promise(() => Promise.all(deferred.map((run) => run())))
      assert.strictEqual((yield* Ref.get(yield* EmailOutbox)).length, 1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('sign-up, verification, sign-in and session: verification is required and idempotent', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      assert.strictEqual((yield* signUp('Ada@Example.com')).status, 200)
      assert.strictEqual((yield* Ref.get(yield* EmailOutbox)).length, 1)
      assert.include((yield* Ref.get(yield* EmailOutbox))[0]?.subject ?? '', 'Verify')

      // No sign-in before verification.
      assert.strictEqual((yield* signIn('ada@example.com')).status, 403)

      const verified = yield* verify
      assert.isBelow(verified.status, 400)
      assert.isFalse(verified.headers.getSetCookie().some((c) => c.includes('session_token=') && !c.includes('Max-Age=0')), 'no auto sign-in after verification')
      // Verifying again changes nothing and does not fail.
      assert.isBelow((yield* verify).status, 400)
      assert.strictEqual(rows<{ emailVerified: number }>(d1, 'select emailVerified from user')[0]?.emailVerified, 1)

      assert.strictEqual((yield* signIn('ada@example.com', 'wrong-password-1')).status, 401)
      assert.strictEqual((yield* signIn('nobody@example.com')).status, 401, 'same answer for an unknown user')

      const ok = yield* signIn('ADA@example.com')
      assert.strictEqual(ok.status, 200)
      const cookie = jar(ok)
      const session = Option.getOrThrow(yield* Auth.use((a) => a.readSession(new Headers({ cookie }))))
      assert.strictEqual(session.email, 'ada@example.com')
      assert.isTrue(session.emailVerified)
      assert.strictEqual(session.accountStatus, 'active')
      assert.isNull(session.activeWorkspaceId)
      assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(new Headers({ cookie: 'better-auth.session_token=forged' })))))
      assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(new Headers()))))

      // Sign-out ends the session.
      const out = yield* handle(post('/sign-out', {}, cookie))
      assert.strictEqual(out.status, 200)
      assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(new Headers({ cookie })))))
    }).pipe(Effect.provide(layer))
  })

  it.effect('a banned user gets no session (password and Google); an expired ban does not block', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      yield* Effect.sync(() => d1.sqlite.exec("update user set banned = 1 where email = 'ada@example.com'"))
      const blocked = yield* signIn('ada@example.com')
      assert.isAbove(blocked.status, 399)
      assert.strictEqual(jar(blocked), '')
      assert.strictEqual(rows<{ n: number }>(d1, 'select count(*) as n from session')[0]?.n, 0)

      d1.sqlite.exec("update user set banExpires = 1000 where email = 'ada@example.com'")
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200, 'expired ban')

      d1.sqlite.exec(`update user set banExpires = ${Date.now() + 3_600_000} where email = 'ada@example.com'`)
      assert.isAbove((yield* signIn('ada@example.com')).status, 399, 'running ban')

      // Google callback for a banned, previously linked, verified account.
      d1.sqlite.exec(`
        insert into user (id, name, email, emailVerified, banned, createdAt, updatedAt) values ('ub', 'B', 'ban@example.com', 1, 1, 1, 1);
        insert into account (id, accountId, providerId, userId, createdAt, updatedAt) values ('ab', 'g-ban', 'google', 'ub', 1, 1);
      `)
      const viaGoogle = yield* google({ sub: 'g-ban', email: 'ban@example.com', email_verified: true })
      assert.strictEqual(jar(viaGoogle), '')
      assert.strictEqual(rows<{ n: number }>(d1, "select count(*) as n from session where userId = 'ub'")[0]?.n, 0)
    }).pipe(Effect.provide(layer))
  })

  it.effect('password reset ends other sessions and does not verify the email', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const cookie = jar(yield* signIn('ada@example.com'))
      const outboxBefore = (yield* Ref.get(yield* EmailOutbox)).length
      assert.strictEqual((yield* handle(post('/request-password-reset', { email: 'ada@example.com', redirectTo: '/reset' }))).status, 200)
      // An unknown address gets the same answer and no email.
      assert.strictEqual((yield* handle(post('/request-password-reset', { email: 'ghost@example.com', redirectTo: '/reset' }))).status, 200)
      const outbox = yield* Ref.get(yield* EmailOutbox)
      assert.strictEqual(outbox.length, outboxBefore + 1)
      const token = /reset-password\/([A-Za-z0-9_-]+)/.exec(outbox.at(-1)?.text ?? '')?.[1] ?? ''
      assert.isAbove(token.length, 10)
      assert.strictEqual((yield* handle(post('/reset-password', { newPassword: 'a-brand-new-password', token }))).status, 200)
      assert.strictEqual((yield* handle(post('/reset-password', { newPassword: 'another-new-password', token }))).status, 400, 'the token works once')
      assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(new Headers({ cookie })))), 'old sessions revoked')
      assert.strictEqual((yield* signIn('ada@example.com', PASSWORD)).status, 401)
      assert.strictEqual((yield* signIn('ada@example.com', 'a-brand-new-password')).status, 200)
      assert.strictEqual(rows<{ n: number }>(d1, 'select count(*) as n from user')[0]?.n, 1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('Google: a new verified Google account signs in; the same account signs in again', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      const first = yield* google({ sub: 'g-1', email: 'Lin@Example.com', email_verified: true })
      assert.strictEqual(first.status, 302)
      assert.include(first.headers.get('location') ?? '', '/app')
      const session = Option.getOrThrow(yield* Auth.use((a) => a.readSession(new Headers({ cookie: jar(first) }))))
      assert.strictEqual(session.email, 'lin@example.com')
      assert.isTrue(session.emailVerified)
      const stored = rows<{ accessToken: string | null; idToken: string | null }>(d1, "select accessToken, idToken from account where providerId = 'google'")[0]
      assert.isTrue(stored?.accessToken !== null && stored?.accessToken !== 'at', 'access token is not stored in plain text')
      assert.notInclude(stored?.idToken ?? '', 'lin@example.com')
      const again = yield* google({ sub: 'g-1', email: 'lin@example.com', email_verified: true })
      assert.include(again.headers.get('location') ?? '', '/app')
      assert.isTrue(Option.isSome(yield* Auth.use((a) => a.readSession(new Headers({ cookie: jar(again) })))))
      assert.strictEqual(rows<{ n: number }>(d1, 'select count(*) as n from user')[0]?.n, 1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('Google pre-account takeover: an unverified password account is never linked, verified or signed into', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      // The attacker registers the victim's address with a password they know.
      yield* signUp('victim@example.com')
      const before = rows<{ emailVerified: number }>(d1, "select emailVerified from user where email = 'victim@example.com'")
      assert.strictEqual(before[0]?.emailVerified, 0)

      // The victim signs in with Google.
      const response = yield* google({ sub: 'g-victim', email: 'victim@example.com', email_verified: true })
      assert.strictEqual(response.status, 302)
      assert.include(response.headers.get('location') ?? '', '/sign-in')
      assert.include(response.headers.get('location') ?? '', 'error=')
      assert.strictEqual(jar(response), '', 'no session cookie')

      const user = rows<{ emailVerified: number }>(d1, "select emailVerified from user where email = 'victim@example.com'")
      assert.strictEqual(user[0]?.emailVerified, 0, 'still unverified: Google did not verify it')
      assert.deepStrictEqual(rows<{ providerId: string }>(d1, 'select providerId from account').map((a) => a.providerId), ['credential'])
      assert.strictEqual(rows<{ n: number }>(d1, 'select count(*) as n from session')[0]?.n, 0)
    }).pipe(Effect.provide(layer))
  })

  it.effect('Google does not auto-link a verified password account either; unverified Google emails are refused', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const linked = yield* google({ sub: 'g-ada', email: 'ada@example.com', email_verified: true })
      assert.include(linked.headers.get('location') ?? '', 'error=')
      assert.deepStrictEqual(rows<{ providerId: string }>(d1, 'select providerId from account').map((a) => a.providerId), ['credential'])

      const unverified = yield* google({ sub: 'g-new', email: 'new@example.com', email_verified: false })
      assert.include(unverified.headers.get('location') ?? '', 'error=')
      assert.strictEqual(rows<{ n: number }>(d1, "select count(*) as n from user where email = 'new@example.com'")[0]?.n, 0)
    }).pipe(Effect.provide(layer))
  })

  it.effect('Google: a previously linked account whose email is still unverified (legacy data) is refused', () => {
    const { d1, layer } = setup()
    d1.sqlite.exec(`
      insert into user (id, name, email, emailVerified, createdAt, updatedAt) values ('u1', 'Old', 'old@example.com', 0, 1, 1);
      insert into account (id, accountId, providerId, userId, createdAt, updatedAt) values ('a1', 'g-old', 'google', 'u1', 1, 1);
      insert into account (id, accountId, providerId, userId, password, createdAt, updatedAt) values ('a2', 'u1', 'credential', 'u1', 'attacker-hash', 1, 1);
    `)
    return Effect.gen(function* () {
      const response = yield* google({ sub: 'g-old', email: 'old@example.com', email_verified: true })
      assert.include(response.headers.get('location') ?? '', 'error=')
      assert.strictEqual(jar(response), '')
      assert.strictEqual(rows<{ emailVerified: number }>(d1, "select emailVerified from user where id = 'u1'")[0]?.emailVerified, 0)
    }).pipe(Effect.provide(layer))
  })

  it.effect('setActiveWorkspace stores the selection on the session; unknown, archived or anonymous fail', () => {
    const { d1, layer } = setup()
    d1.sqlite.exec(`
      insert into user (id, name, email, emailVerified, createdAt, updatedAt) values ('u9', 'Pat', 'pat@example.com', 1, 1, 1);
      insert into organization (id, name, slug, createdAt, kind, personalOwnerUserId) values ('w-live', 'Pat', 'pat', 1, 'personal', 'u9');
      insert into organization (id, name, slug, createdAt, kind, archivedAt) values ('w-old', 'Old Co', 'old-co', 1, 'company', 5);
    `)
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const cookie = jar(yield* signIn('ada@example.com'))
      const headers = new Headers({ cookie })
      const auth = yield* Auth

      const done = yield* auth.setActiveWorkspace(headers, 'w-live')
      assert.isDefined(done.headers)
      assert.strictEqual(Option.getOrThrow(yield* auth.readSession(headers)).activeWorkspaceId, 'w-live')
      assert.strictEqual((yield* auth.setActiveWorkspace(headers, 'w-old').pipe(Effect.flip))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* auth.setActiveWorkspace(headers, 'nope').pipe(Effect.flip))._tag, 'WorkspaceUnavailable')
      assert.strictEqual(Option.getOrThrow(yield* auth.readSession(headers)).activeWorkspaceId, 'w-live', 'a refused switch changes nothing')
      assert.strictEqual((yield* auth.setActiveWorkspace(new Headers(), 'w-live').pipe(Effect.flip))._tag, 'Unauthenticated')
      yield* auth.setActiveWorkspace(headers, null)
      assert.isNull(Option.getOrThrow(yield* auth.readSession(headers)).activeWorkspaceId)
    }).pipe(Effect.provide(layer))
  })

  it.effect('a suspended (banned) account is reported as suspended', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const headers = new Headers({ cookie: jar(yield* signIn('ada@example.com')) })
      d1.sqlite.exec('update user set banned = 1')
      assert.strictEqual(Option.getOrThrow(yield* Auth.use((a) => a.readSession(headers))).accountStatus, 'suspended')
      d1.sqlite.exec('update user set banExpires = 1')
      assert.strictEqual(Option.getOrThrow(yield* Auth.use((a) => a.readSession(headers))).accountStatus, 'active', 'expired ban')
    }).pipe(Effect.provide(layer))
  })

  describe('session read without the SDK', () => {
    const secret = Redacted.value(Option.getOrThrow(AppConfig.testConfig.auth).secret)
    const tokenRows = (d1: MemoryD1) => rows<{ token: string; expiresAt: number }>(d1, 'select token, expiresAt from session')

    const signedIn = (email = 'ada@example.com') =>
      Effect.gen(function* () {
        yield* signUp(email)
        yield* verify
        return jar(yield* signIn(email))
      })

    it.effect("accepts the exact cookie better-auth set, and rejects forged, unsigned or foreign-secret ones", () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        const [name, value] = [cookie.slice(0, cookie.indexOf('=')), cookie.slice(cookie.indexOf('=') + 1)]
        const token = tokenRows(d1)[0]?.token ?? ''
        // Our signer reproduces the SDK's cookie byte for byte, and our verifier accepts it.
        assert.strictEqual(yield* Effect.promise(() => signCookieValue(token, secret)), value)
        assert.strictEqual(yield* Effect.promise(() => verifySignedCookie(readCookie(cookie, name), secret)), token)
        const read = (cookieHeader: string) => Auth.use((a) => a.readSession(new Headers({ cookie: cookieHeader })))
        assert.isTrue(Option.isSome(yield* read(cookie)))
        const decoded = decodeURIComponent(value)
        const flip = (text: string) => `${text.slice(0, -2)}${text.at(-2) === 'A' ? 'B' : 'A'}=`
        const forged = [
          `${name}=${encodeURIComponent(flip(decoded))}`, // signature changed
          `${name}=${token}`, // unsigned token
          `${name}=${encodeURIComponent(`${token}x.${decoded.slice(decoded.lastIndexOf('.') + 1)}`)}`, // token changed, signature kept
          `${name}=${yield* Effect.promise(() => signCookieValue(token, 'another-secret-another-secret-0123'))}`, // signed with another secret
          `${name}=${encodeURIComponent(`${decoded.slice(0, decoded.lastIndexOf('.'))}.short=`)}`, // malformed signature
          `${name}=%E0%A4%A`, // malformed escape
        ]
        for (const header of forged) assert.isTrue(Option.isNone(yield* read(header)), header)
      }).pipe(Effect.provide(layer))
    })

    it.effect('an expired session is none and its row is deleted; an old one is extended', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        const headers = new Headers({ cookie })
        const nowSeconds = Math.floor(Date.now() / 1000)
        const untouched = tokenRows(d1)[0]?.expiresAt ?? 0
        yield* Auth.use((a) => a.readSession(headers))
        assert.strictEqual(tokenRows(d1)[0]?.expiresAt, untouched, 'a fresh session is not rewritten')

        d1.sqlite.exec(`update session set expiresAt = ${nowSeconds + 10 * 86400}`)
        assert.isTrue(Option.isSome(yield* Auth.use((a) => a.readSession(headers))))
        assert.isAbove(tokenRows(d1)[0]?.expiresAt ?? 0, nowSeconds + 29 * 86400, 'extended to a full lifetime')

        d1.sqlite.exec(`update session set expiresAt = ${nowSeconds - 60}`)
        assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(headers))))
        assert.strictEqual(tokenRows(d1).length, 0, 'expired row removed')
      }).pipe(Effect.provide(layer))
    })

    const sessionCookies = (response: Response) => response.headers.getSetCookie()

    it.effect('a refresh hands the session cookie out again, signed, with Max-Age from the new expiry; no refresh, no header', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        const token = tokenRows(d1)[0]?.token ?? ''
        const fresh = yield* handle(get('get-session', cookie))
        assert.deepStrictEqual(sessionCookies(fresh), [], 'a fresh session sets nothing')

        d1.sqlite.exec(`update session set expiresAt = ${Math.floor(Date.now() / 1000) + 10 * 86400}`)
        const refreshed = yield* handle(get('get-session', cookie))
        const [header] = sessionCookies(refreshed)
        assert.strictEqual(sessionCookies(refreshed).length, 1)
        const [pair, ...attributes] = (header ?? '').split('; ')
        const name = pair?.slice(0, pair.indexOf('=')) ?? ''
        assert.strictEqual(name, '__Secure-better-auth.session_token')
        assert.strictEqual(yield* Effect.promise(() => verifySignedCookie(readCookie(pair ?? '', name), secret)), token)
        const maxAge = Number(attributes.find((a) => a.startsWith('Max-Age='))?.slice(8))
        assert.approximately(maxAge, 30 * 86400, 5)
        assert.includeMembers(attributes, ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'])
      }).pipe(Effect.provide(layer))
    })

    it.effect('only a signed dont_remember stops the refresh', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        const soon = Math.floor(Date.now() / 1000) + 10 * 86400
        const reset = () => d1.sqlite.exec(`update session set expiresAt = ${soon}`)
        const dont = (value: string) => `${cookie}; __Secure-better-auth.dont_remember=${value}`
        reset()
        yield* Auth.use((a) => a.readSession(new Headers({ cookie: dont('true') })))
        assert.isAbove(tokenRows(d1)[0]?.expiresAt ?? 0, soon, 'an unsigned dont_remember is ignored, the session is extended')
        reset()
        const signed = yield* Effect.promise(() => signCookieValue('true', secret))
        yield* Auth.use((a) => a.readSession(new Headers({ cookie: dont(signed) })))
        assert.strictEqual(tokenRows(d1)[0]?.expiresAt, soon, 'a signed dont_remember is respected')
      }).pipe(Effect.provide(layer))
    })

    it.effect('a session deleted between the read and the refresh is none', () => {
      const d1 = openMemoryD1()
      const racing = {
        ...d1.binding,
        prepare: (sql: string) => {
          if (/^update "session"/i.test(sql)) d1.sqlite.exec('delete from session')
          return d1.binding.prepare(sql)
        },
      } as D1Database
      const layer = AuthLive.layer(racing).pipe(Layer.provideMerge(emailMemory), Layer.provide(AppConfig.test()))
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        d1.sqlite.exec(`update session set expiresAt = ${Math.floor(Date.now() / 1000) + 10 * 86400}`)
        const response = yield* handle(get('get-session', cookie))
        assert.isNull(yield* Effect.promise(() => response.json()))
        assert.deepStrictEqual(sessionCookies(response), [])
      }).pipe(Effect.provide(layer))
    })

    it.effect('answers get-session itself, with no session token in the body, and null without a session', () => {
      const { layer } = setup()
      return Effect.gen(function* () {
        const cookie = yield* signedIn()
        const response = yield* handle(get('get-session', cookie))
        const body = (yield* Effect.promise(() => response.json())) as { session: Record<string, unknown>; user: Record<string, unknown> }
        assert.strictEqual(body.user['email'], 'ada@example.com')
        assert.strictEqual(body.user['name'], 'Ada')
        assert.notProperty(body.session, 'token')
        const none = yield* handle(get('get-session'))
        assert.strictEqual(none.status, 200)
        assert.isNull(yield* Effect.promise(() => none.json()))
      }).pipe(Effect.provide(layer))
    })

    it.effect('does not load the SDK until an identity request needs it', () => {
      const { layer } = setup()
      return Effect.gen(function* () {
        // Building the layer and reading sessions must work even though `./authOptions` was never imported by the layer itself.
        assert.isTrue(Option.isNone(yield* Auth.use((a) => a.readSession(new Headers()))))
      }).pipe(Effect.provide(layer))
    })
  })

  it.effect('a body cannot write fields the SDK does not own (role, storage quota, banned)', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* handle(post('/sign-up/email', { email: 'mal@example.com', password: PASSWORD, name: 'Mal', role: 'admin', banned: true, storageQuotaGb: 9999, emailVerified: true }))
      const user = rows<{ role: string; banned: number; storageQuotaGb: number; emailVerified: number }>(d1, 'select role, banned, storageQuotaGb, emailVerified from user')[0]
      assert.deepStrictEqual(user, { role: 'user', banned: 0, storageQuotaGb: 5, emailVerified: 0 })
    }).pipe(Effect.provide(layer))
  })
})

describe('login passwords: PBKDF2 for new hashes, scrypt verify, one-time rehash', () => {
  const storedHash = (d1: MemoryD1) => rows<{ password: string }>(d1, "select password from account where providerId = 'credential'")[0]?.password ?? ''
  const setStored = (d1: MemoryD1, value: string) => d1.sqlite.prepare("update account set password = ? where providerId = 'credential'").run(value)
  const withRehash = (rehashPasswords: boolean) => ({ auth: Option.some({ ...Option.getOrThrow(AppConfig.testConfig.auth), rehashPasswords }) })
  /** An account the way the legacy app wrote it: better-auth scrypt `<salt>:<key>`. */
  const legacyAccount = (d1: MemoryD1) =>
    Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const legacy = yield* Effect.promise(() => scryptHash(PASSWORD))
      setStored(d1, legacy)
      return legacy
    })

  it.effect('sign-up writes p1$10000$; sign-in works with it; a wrong password is 401', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      assert.match(storedHash(d1), /^p1\$10000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/)
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200)
      assert.strictEqual((yield* signIn('ada@example.com', 'wrong-password-1')).status, 401)
      assert.match(storedHash(d1), /^p1\$10000\$/, 'a wrong password changes nothing')
    }).pipe(Effect.provide(layer))
  })

  it.effect('the same password in a different Unicode form signs in (NFKC), as with the SDK scrypt', () => {
    const { layer } = setup()
    return Effect.gen(function* () {
      yield* handle(post('/sign-up/email', { email: 'eve@example.com', password: 'café-password-1', name: 'Eve' }))
      yield* verify
      assert.strictEqual((yield* signIn('eve@example.com', 'café-password-1')).status, 200)
    }).pipe(Effect.provide(layer))
  })

  it.effect('a legacy scrypt account signs in and its hash becomes p1$ (flag on); it keeps signing in', () => {
    const { d1, layer } = setup(undefined, withRehash(true))
    return Effect.gen(function* () {
      const legacy = yield* legacyAccount(d1)
      assert.strictEqual((yield* signIn('ada@example.com', 'wrong-password-1')).status, 401)
      assert.strictEqual(storedHash(d1), legacy, 'a wrong password does not rehash')
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200)
      const rewritten = storedHash(d1)
      assert.match(rewritten, /^p1\$10000\$/)
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200)
      assert.strictEqual(storedHash(d1), rewritten, 'rewritten once, not on every sign-in')
      assert.strictEqual((yield* signIn('ada@example.com', 'wrong-password-1')).status, 401)
    }).pipe(Effect.provide(layer))
  })

  it.effect('flag off: a legacy scrypt hash verifies and is left exactly as it was', () => {
    const { d1, layer } = setup(undefined, withRehash(false))
    return Effect.gen(function* () {
      const legacy = yield* legacyAccount(d1)
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200)
      assert.strictEqual((yield* signIn('ada@example.com')).status, 200)
      assert.strictEqual(storedHash(d1), legacy)
    }).pipe(Effect.provide(layer))
  })

  it.effect('malformed stored hashes are a plain 401, never a 500 and never a rewrite', () => {
    const { d1, layer } = setup(undefined, withRehash(true))
    return Effect.gen(function* () {
      yield* signUp('ada@example.com')
      yield* verify
      const salt = 'AAAAAAAAAAAAAAAAAAAAAA'
      const hash = 'A'.repeat(43)
      for (const bad of [
        'garbage',
        'abc:zz',
        ':',
        'p1$',
        'p1$10000',
        `p1$0$${salt}$${hash}`,
        `p1$-5$${salt}$${hash}`,
        `p1$1.5$${salt}$${hash}`,
        `p1$100001$${salt}$${hash}`,
        `p1$10000$${salt}$${hash}$extra`,
        `p2$10000$${salt}$${hash}`,
        `p1$10000$!!!$${hash}`,
        `p1$10000$${salt}$${hash}`,
      ]) {
        setStored(d1, bad)
        assert.strictEqual((yield* signIn('ada@example.com')).status, 401, bad)
        assert.strictEqual(storedHash(d1), bad)
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect('a password reset and a password change write p1$', () => {
    const { d1, layer } = setup(undefined, withRehash(true))
    return Effect.gen(function* () {
      yield* legacyAccount(d1)
      yield* handle(post('/request-password-reset', { email: 'ada@example.com', redirectTo: '/reset' }))
      const token = /reset-password\/([A-Za-z0-9_-]+)/.exec((yield* Ref.get(yield* EmailOutbox)).at(-1)?.text ?? '')?.[1] ?? ''
      assert.strictEqual((yield* handle(post('/reset-password', { newPassword: 'a-brand-new-password', token }))).status, 200)
      assert.match(storedHash(d1), /^p1\$10000\$/)
      const cookie = jar(yield* signIn('ada@example.com', 'a-brand-new-password'))
      const change = yield* handle(post('/change-password', { currentPassword: 'a-brand-new-password', newPassword: 'and-a-third-password' }, cookie))
      assert.strictEqual(change.status, 200)
      assert.match(storedHash(d1), /^p1\$10000\$/)
      assert.strictEqual((yield* signIn('ada@example.com', 'a-brand-new-password')).status, 401)
      assert.strictEqual((yield* signIn('ada@example.com', 'and-a-third-password')).status, 200)
    }).pipe(Effect.provide(layer))
  })

  it.effect('changing a legacy password: the rewrite of the old hash never overwrites the new one', () => {
    const { d1, layer } = setup(undefined, withRehash(true))
    return Effect.gen(function* () {
      yield* legacyAccount(d1)
      const cookie = jar(yield* signIn('ada@example.com'))
      // Back to scrypt, so change-password verifies (and, with the flag on, rewrites) the legacy hash before it stores the new one.
      setStored(d1, yield* Effect.promise(() => scryptHash(PASSWORD)))
      const change = yield* handle(post('/change-password', { currentPassword: PASSWORD, newPassword: 'and-a-third-password' }, cookie))
      assert.strictEqual(change.status, 200)
      assert.strictEqual((yield* signIn('ada@example.com', PASSWORD)).status, 401)
      assert.strictEqual((yield* signIn('ada@example.com', 'and-a-third-password')).status, 200)
    }).pipe(Effect.provide(layer))
  })

  describe('rehash race (the SDK option, called directly)', () => {
    const verifyWith = (d1: MemoryD1, rehashPasswords: boolean) =>
      authOptions({
        db: drizzle(d1.binding, { schema }),
        settings: { ...Option.getOrThrow(AppConfig.testConfig.auth), rehashPasswords },
        siteUrl: AppConfig.testConfig.siteUrl,
        trustedOrigins: AppConfig.testConfig.trustedOrigins,
        mailer: { verification: () => Promise.resolve(), passwordReset: () => Promise.resolve() },
        googleUserInfo: () => Promise.resolve(null),
      }).emailAndPassword.password.verify

    it.effect('two sign-ins at once both succeed and leave one valid p1$ hash', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const legacy = yield* legacyAccount(d1)
        const verifyPassword = verifyWith(d1, true)
        const results = yield* Effect.promise(() =>
          Promise.all([verifyPassword({ hash: legacy, password: PASSWORD }), verifyPassword({ hash: legacy, password: PASSWORD })]),
        )
        assert.deepStrictEqual(results, [true, true])
        const final = storedHash(d1)
        assert.match(final, /^p1\$10000\$/)
        assert.isTrue(yield* Effect.promise(() => verifyPassword({ hash: final, password: PASSWORD })))
        assert.isFalse(yield* Effect.promise(() => verifyPassword({ hash: final, password: 'wrong-password-1' })))
        assert.strictEqual(rows<{ n: number }>(d1, "select count(*) as n from account where providerId = 'credential'")[0]?.n, 1)
      }).pipe(Effect.provide(layer))
    })

    it.effect('a password that changed in between is not overwritten by the old rewrite', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const legacy = yield* legacyAccount(d1)
        const newer = `p1$10000$AAAAAAAAAAAAAAAAAAAAAA$${'B'.repeat(43)}`
        setStored(d1, newer) // a reset landed after the sign-in read the old hash
        assert.isTrue(yield* Effect.promise(() => verifyWith(d1, true)({ hash: legacy, password: PASSWORD })))
        assert.strictEqual(storedHash(d1), newer)
      }).pipe(Effect.provide(layer))
    })

    it.effect('an account that is not a credential account is never touched', () => {
      const { d1, layer } = setup()
      return Effect.gen(function* () {
        const legacy = yield* legacyAccount(d1)
        d1.sqlite.prepare("update account set providerId = 'google' where providerId = 'credential'").run()
        assert.isTrue(yield* Effect.promise(() => verifyWith(d1, true)({ hash: legacy, password: PASSWORD })))
        assert.strictEqual(rows<{ password: string }>(d1, 'select password from account')[0]?.password, legacy)
      }).pipe(Effect.provide(layer))
    })
  })
})

describe('authOptions', () => {
  const options = authOptions({
    db: undefined as never,
    settings: Option.getOrThrow(AppConfig.testConfig.auth),
    siteUrl: AppConfig.testConfig.siteUrl,
    trustedOrigins: AppConfig.testConfig.trustedOrigins,
    mailer: { verification: () => Promise.resolve(), passwordReset: () => Promise.resolve() },
    googleUserInfo: () => Promise.resolve(null),
  })

  it('every field VizCad adds to the SDK schema is server-only (input: false)', () => {
    for (const [name, field] of Object.entries(organizationFields)) assert.strictEqual(field.input, false, name)
    assert.deepStrictEqual(Object.keys(organizationFields).sort(), ['archivedAt', 'kind', 'onboardingCompletedAt', 'personalOwnerUserId'])
  })

  it('hardened settings: no linking, no cookie cache, no account deletion, no auto sign-in, own rate limiter', () => {
    assert.strictEqual(options.account.accountLinking.enabled, false)
    assert.strictEqual(options.session.cookieCache.enabled, false)
    assert.strictEqual(options.user.deleteUser.enabled, false)
    assert.strictEqual(options.emailVerification.autoSignInAfterVerification, false)
    assert.strictEqual(options.emailAndPassword.requireEmailVerification, true)
    assert.strictEqual(options.emailAndPassword.revokeSessionsOnPasswordReset, true)
    assert.strictEqual(options.rateLimit.enabled, false)
    assert.deepStrictEqual(options.trustedOrigins, ['https://vizcad.test'])
    assert.isDefined(schema.organization)
  })
})

describe('Auth (in-memory layer)', () => {
  it.effect('resolves seeded sessions, switches workspaces and records identity requests', () =>
    Effect.gen(function* () {
      const state = yield* MemoryAuth
      const summary = { sessionId: 's1', userId: 'u1', name: 'A', email: 'a@x.test', emailVerified: true, accountStatus: 'active' as const, activeWorkspaceId: null }
      yield* Ref.set(state, { sessions: new Map([['t1', summary]]), workspaces: new Set(['w1']), handled: [] })
      const auth = yield* Auth
      const headers = new Headers({ cookie: 'session=t1' })
      assert.strictEqual(Option.getOrThrow(yield* auth.readSession(headers)).userId, 'u1')
      assert.isTrue(Option.isNone(yield* auth.readSession(new Headers())))
      yield* auth.setActiveWorkspace(headers, 'w1')
      assert.strictEqual(Option.getOrThrow(yield* auth.readSession(headers)).activeWorkspaceId, 'w1')
      assert.strictEqual((yield* auth.setActiveWorkspace(headers, 'zz').pipe(Effect.flip))._tag, 'WorkspaceUnavailable')
      assert.strictEqual((yield* auth.setActiveWorkspace(new Headers(), 'w1').pipe(Effect.flip))._tag, 'Unauthenticated')
      yield* auth.handleIdentityRequest(new Request(`${ORIGIN}/api/auth/get-session`))
      assert.deepStrictEqual((yield* Ref.get(state)).handled, ['GET /api/auth/get-session'])
      assert.strictEqual((yield* auth.handleIdentityRequest(new Request(`${ORIGIN}/api/auth/crash`)).pipe(Effect.flip))._tag, 'AuthError')
    }).pipe(Effect.provide(memory)),
  )
})
