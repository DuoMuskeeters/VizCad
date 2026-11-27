import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Duration, Effect, Exit, Layer, Option, Redacted } from 'effect'
import * as schema from '../db/schema'
import { passwordResetEmail, localeFromHeader, verificationEmail, type RenderedEmail } from '../emails/auth'
import { AuthError, ConfigError, Unauthenticated, WorkspaceUnavailable } from '../errors'
import { AppConfig } from './AppConfig'
import { Auth, type SessionSummary } from './Auth'
import { platformRoleOf } from '../permissions'
import { isBanned } from './accountStatus'
import type { AuthMailer } from './authOptions'
import { Email } from './Email'
import { googleUserInfo } from './googleProfile'
import { dontRememberCookieName, readCookie, SESSION_EXPIRES_IN, SESSION_UPDATE_AGE, sessionCookieName, signCookieValue, verifySignedCookie } from './sessionCookie'

const fail = (operation: string) => (cause: unknown) => new AuthError({ operation, cause })

/**
 * Auth backed by better-auth 1.4.7 on D1 (the Worker's `vizcad_auth` binding). The SDK is constructed here and
 * nowhere else, and only on the first identity request (dynamic import of authOptions.ts: its own chunk). Session reads
 * (`readSession`, `setActiveWorkspace`, `GET /api/auth/get-session`) never load it: they verify better-auth's signed cookie
 * with WebCrypto (sessionCookie.ts) and read the `session` row, with the same expiry, refresh and ban rules. Mail goes through the Email service; the send is deferred (`waitUntil`), and a failed send is logged by tag and
 * swallowed, so neither the response nor its timing says whether a send was attempted (no account-existence signal). Resend is the
 * `/send-verification-email` endpoint.
 */
export type Defer = (run: () => Promise<void>) => void

/** Runs the work right away and does not wait for it (tests that do not care). Live code passes `waitUntil`. */
export const detached: Defer = (run) => {
  void run()
}

export const layer = (d1: D1Database, defer: Defer = detached) =>
  Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const email = yield* Email
      const settings = Option.getOrUndefined(config.auth)
      if (settings === undefined) return yield* new ConfigError({ message: 'BETTER_AUTH_SECRET is not configured' })

      const db = drizzle(d1, { schema })

      // The send runs after the response (waitUntil), so response time never tells an existing account from an unknown one.
      const send = (operation: string, message: RenderedEmail, to: string) => {
        defer(() =>
          email.send({ to, ...message }).pipe(
            Effect.catch(() => Effect.logError('identity email failed').pipe(Effect.annotateLogs({ error: 'EmailError', operation }))),
            Effect.asVoid,
            Effect.runPromise,
          ),
        )
        return Promise.resolve()
      }

      const mailer: AuthMailer = {
        verification: ({ user, url, request }) =>
          send('verification', verificationEmail({ url, locale: localeFromHeader(request?.headers.get('accept-language')) }), user.email),
        passwordReset: ({ user, url, request }) =>
          send('passwordReset', passwordResetEmail({ url, locale: localeFromHeader(request?.headers.get('accept-language')) }), user.email),
      }

      const findUserByEmail = (address: string) =>
        Effect.tryPromise({
          try: () => db.select({ emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.email, address)).limit(1),
          catch: (cause) => cause,
        }).pipe(Effect.map((rows) => Option.fromNullishOr(rows[0])))

      // Built once per layer, on the first identity request. The dynamic import keeps better-auth, kysely, zod and jose out of every other path.
      // A failed setup (a chunk that did not load) is not kept: the next request tries again.
      const sdk = yield* Effect.cachedWithTTL(
        Effect.tryPromise({
          try: () =>
            import('./authOptions').then(({ createAuth }) =>
              createAuth({
                db,
                settings,
                siteUrl: config.siteUrl,
                trustedOrigins: config.trustedOrigins,
                mailer,
                googleUserInfo: (idToken) => googleUserInfo(idToken, findUserByEmail).pipe(Effect.runPromise),
              }),
            ),
          catch: fail('init'),
        }),
        (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      )

      const secure = config.siteUrl.protocol === 'https:'
      const secret = Redacted.value(settings.secret)

      interface Found {
        readonly sessionId: string
        readonly activeWorkspaceId: string | null
        readonly expiresAt: Date
        /** The session was extended by this read; the response must hand out the cookie again. */
        readonly refreshed: boolean
        readonly user: { readonly id: string; readonly name: string; readonly email: string; readonly emailVerified: boolean }
        readonly accountStatus: SessionSummary['accountStatus']
        readonly platformRole: SessionSummary['platformRole']
      }

      /**
       * better-auth's `getSession` without the SDK: signed cookie -> one `session` + `user` query -> expired sessions are deleted
       * and read as none -> a session older than `updateAge` is extended (unless the sign-in asked not to be remembered).
       * Authority always comes from D1 (no cookie cache).
       */
      const find = (headers: Headers): Effect.Effect<Option.Option<Found>, AuthError> =>
        Effect.gen(function* () {
          const cookies = headers.get('cookie')
          const token = yield* Effect.tryPromise({
            try: () => verifySignedCookie(readCookie(cookies, sessionCookieName(secure)), secret),
            catch: fail('readSession'),
          })
          if (token === null) return Option.none<Found>()
          const [row] = yield* Effect.tryPromise({
            try: () =>
              db
                .select({
                  sessionId: schema.session.id,
                  expiresAt: schema.session.expiresAt,
                  activeOrganizationId: schema.session.activeOrganizationId,
                  userId: schema.user.id,
                  name: schema.user.name,
                  email: schema.user.email,
                  emailVerified: schema.user.emailVerified,
                  banned: schema.user.banned,
                  banExpires: schema.user.banExpires,
                  role: schema.user.role,
                })
                .from(schema.session)
                .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
                .where(eq(schema.session.token, token))
                .limit(1),
            catch: fail('readSession'),
          })
          if (row === undefined) return Option.none<Found>()
          const now = Date.now()
          if (row.expiresAt.getTime() < now) {
            yield* Effect.tryPromise({ try: () => db.delete(schema.session).where(eq(schema.session.id, row.sessionId)), catch: fail('readSession') })
            return Option.none<Found>()
          }
          let expiresAt = row.expiresAt
          let refreshed = false
          // Only a signed `dont_remember` counts (better-auth reads it with getSignedCookie).
          const dontRemember = yield* Effect.tryPromise({
            try: () => verifySignedCookie(readCookie(cookies, dontRememberCookieName(secure)), secret),
            catch: fail('readSession'),
          })
          if (dontRemember === null && row.expiresAt.getTime() - SESSION_EXPIRES_IN * 1000 + SESSION_UPDATE_AGE * 1000 <= now) {
            const next = new Date(now + SESSION_EXPIRES_IN * 1000)
            const updated = yield* Effect.tryPromise({
              try: () =>
                db
                  .update(schema.session)
                  .set({ expiresAt: next, updatedAt: new Date(now) })
                  .where(eq(schema.session.id, row.sessionId))
                  .returning({ id: schema.session.id }),
              catch: fail('readSession'),
            })
            // Deleted in the meantime (sign-out, revoke): there is no session any more.
            if (updated.length === 0) return Option.none<Found>()
            expiresAt = next
            refreshed = true
          }
          return Option.some<Found>({
            sessionId: row.sessionId,
            activeWorkspaceId: row.activeOrganizationId,
            expiresAt,
            refreshed,
            user: { id: row.userId, name: row.name, email: row.email, emailVerified: row.emailVerified },
            accountStatus: isBanned(row, now) ? 'suspended' : 'active',
            platformRole: platformRoleOf(row.role),
          })
        })

      /** better-auth's `setSessionCookie` for a refresh: same name, attributes and signature; `Max-Age` counts down to the new expiry. */
      const refreshedCookie = (token: string, expiresAt: Date) =>
        Effect.tryPromise({ try: () => signCookieValue(token, secret), catch: fail('readSession') }).pipe(
          Effect.map((value) => {
            const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
            return `${sessionCookieName(secure)}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`
          }),
        )

      const sessionResponse = (found: Option.Option<Found>, cookie: string | null) => {
        const response = Response.json(
          Option.isNone(found)
            ? null
            : {
                session: { id: found.value.sessionId, userId: found.value.user.id, expiresAt: found.value.expiresAt, activeOrganizationId: found.value.activeWorkspaceId },
                user: found.value.user,
              },
        )
        if (cookie !== null) response.headers.append('set-cookie', cookie)
        return response
      }

      return Auth.of({
        handleIdentityRequest: (request) => {
          // The client reads the session here on every app load; it is answered without the SDK.
          if (request.method === 'GET' && new URL(request.url).pathname === '/api/auth/get-session') {
            // A refresh extends the row, so the browser's cookie is renewed here too (otherwise it expires at the old date).
            return Effect.gen(function* () {
              const found = yield* find(request.headers)
              if (Option.isNone(found) || !found.value.refreshed) return sessionResponse(found, null)
              const token = yield* Effect.tryPromise({
                try: () => verifySignedCookie(readCookie(request.headers.get('cookie'), sessionCookieName(secure)), secret),
                catch: fail('readSession'),
              })
              return sessionResponse(found, token === null ? null : yield* refreshedCookie(token, found.value.expiresAt))
            })
          }
          return sdk.pipe(Effect.flatMap((auth) => Effect.tryPromise({ try: () => auth.handler(request), catch: fail('handler') })))
        },

        readSession: (headers) =>
          find(headers).pipe(
            Effect.map(
              Option.map(
                (found): SessionSummary => ({
                  sessionId: found.sessionId,
                  userId: found.user.id,
                  name: found.user.name,
                  email: found.user.email,
                  emailVerified: found.user.emailVerified,
                  accountStatus: found.accountStatus,
                  platformRole: found.platformRole,
                  activeWorkspaceId: found.activeWorkspaceId,
                }),
              ),
            ),
          ),

        setActiveWorkspace: (headers, workspaceId) =>
          Effect.gen(function* () {
            const found = yield* find(headers)
            if (Option.isNone(found)) return yield* new Unauthenticated()
            if (workspaceId !== null) {
              const rows = yield* Effect.tryPromise({
                try: () =>
                  db
                    .select({ id: schema.organization.id })
                    .from(schema.organization)
                    .where(and(eq(schema.organization.id, workspaceId), isNull(schema.organization.archivedAt)))
                    .limit(1),
                catch: fail('setActiveWorkspace'),
              })
              if (rows.length === 0) return yield* new WorkspaceUnavailable()
            }
            yield* Effect.tryPromise({
              try: () => db.update(schema.session).set({ activeOrganizationId: workspaceId }).where(eq(schema.session.id, found.value.sessionId)),
              catch: fail('setActiveWorkspace'),
            })
            // The selection lives on the session row (no cookie cache), so no cookie changes.
            return { headers: new Headers() }
          }),
      })
    }),
  )
