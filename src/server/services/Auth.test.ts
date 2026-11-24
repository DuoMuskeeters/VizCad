import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { vi } from 'vitest'
import * as schema from '../db/schema'
import { openMemoryD1, type MemoryD1 } from '../testing/memoryD1'
import * as AppConfig from './AppConfig'
import { Auth, MemoryAuth, memory } from './Auth'
import * as AuthLive from './Auth.live'
import { EmailOutbox, memory as emailMemory } from './Email'
import { authOptions, organizationFields } from './authOptions'

const ORIGIN = 'https://vizcad.test'
const PASSWORD = 'correct-horse-battery'

/** The real SDK on an in-memory D1 with every migration, with mail captured in the Email outbox. */
const setup = () => {
  const d1: MemoryD1 = openMemoryD1()
  const layer = AuthLive.layer(d1.binding).pipe(Layer.provideMerge(emailMemory), Layer.provide(AppConfig.test()))
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

  it.effect('a body cannot write fields the SDK does not own (role, storage quota, banned)', () => {
    const { d1, layer } = setup()
    return Effect.gen(function* () {
      yield* handle(post('/sign-up/email', { email: 'mal@example.com', password: PASSWORD, name: 'Mal', role: 'admin', banned: true, storageQuotaGb: 9999, emailVerified: true }))
      const user = rows<{ role: string; banned: number; storageQuotaGb: number; emailVerified: number }>(d1, 'select role, banned, storageQuotaGb, emailVerified from user')[0]
      assert.deepStrictEqual(user, { role: 'user', banned: 0, storageQuotaGb: 5, emailVerified: 0 })
    }).pipe(Effect.provide(layer))
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
      const summary = { sessionId: 's1', userId: 'u1', email: 'a@x.test', emailVerified: true, accountStatus: 'active' as const, activeWorkspaceId: null }
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
