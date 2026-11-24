import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Effect, Layer, Option } from 'effect'
import * as schema from '../db/schema'
import { passwordResetEmail, localeFromHeader, verificationEmail, type RenderedEmail } from '../emails/auth'
import { AuthError, ConfigError, Unauthenticated, WorkspaceUnavailable } from '../errors'
import { AppConfig } from './AppConfig'
import { Auth, type SessionSummary } from './Auth'
import { createAuth, type AuthMailer } from './authOptions'
import { Email } from './Email'
import { googleUserInfo } from './googleProfile'

const fail = (operation: string) => (cause: unknown) => new AuthError({ operation, cause })

/**
 * Auth backed by better-auth 1.4.7 on D1 (the Worker's `vizcad_auth` binding). The SDK is constructed here and
 * nowhere else. Mail goes through the Email service; a failed send is logged by tag and swallowed so the
 * response is identical whether or not it was attempted (no account-existence signal). Resend is the
 * `/send-verification-email` endpoint.
 */
export const layer = (d1: D1Database) =>
  Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const email = yield* Email
      const settings = Option.getOrUndefined(config.auth)
      if (settings === undefined) return yield* new ConfigError({ message: 'BETTER_AUTH_SECRET is not configured' })

      const db = drizzle(d1, { schema })

      const send = (operation: string, message: RenderedEmail, to: string) =>
        email.send({ to, ...message }).pipe(
          Effect.catch(() => Effect.logError('identity email failed').pipe(Effect.annotateLogs({ error: 'EmailError', operation }))),
          Effect.asVoid,
          Effect.runPromise,
        )

      const mailer: AuthMailer = {
        verification: ({ user, url, request }) =>
          send('verification', verificationEmail({ name: user.name, url, locale: localeFromHeader(request?.headers.get('accept-language')) }), user.email),
        passwordReset: ({ user, url, request }) =>
          send('passwordReset', passwordResetEmail({ name: user.name, url, locale: localeFromHeader(request?.headers.get('accept-language')) }), user.email),
      }

      const findUserByEmail = (address: string) =>
        Effect.tryPromise({
          try: () => db.select({ emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.email, address)).limit(1),
          catch: (cause) => cause,
        }).pipe(Effect.map((rows) => Option.fromNullishOr(rows[0])))

      const sdk = yield* Effect.try({
        try: () =>
          createAuth({
            db,
            settings,
            siteUrl: config.siteUrl,
            trustedOrigins: config.trustedOrigins,
            mailer,
            googleUserInfo: (idToken) => googleUserInfo(idToken, findUserByEmail).pipe(Effect.runPromise),
          }),
        catch: fail('init'),
      })

      const accountStatus = (userId: string) =>
        Effect.tryPromise({
          try: () => db.select({ banned: schema.user.banned, banExpires: schema.user.banExpires }).from(schema.user).where(eq(schema.user.id, userId)).limit(1),
          catch: fail('readSession'),
        }).pipe(
          Effect.map(([row]): SessionSummary['accountStatus'] =>
            row?.banned === true && (row.banExpires === null || row.banExpires.getTime() > Date.now()) ? 'suspended' : 'active',
          ),
        )

      const resolve = (headers: Headers) =>
        Effect.tryPromise({ try: () => sdk.api.getSession({ headers }), catch: fail('readSession') })

      return Auth.of({
        handleIdentityRequest: (request) => Effect.tryPromise({ try: () => sdk.handler(request), catch: fail('handler') }),

        readSession: (headers) =>
          Effect.gen(function* () {
            const found = yield* resolve(headers)
            if (!found) return Option.none<SessionSummary>()
            const active = (found.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
            return Option.some<SessionSummary>({
              sessionId: found.session.id,
              userId: found.user.id,
              email: found.user.email,
              emailVerified: found.user.emailVerified,
              accountStatus: yield* accountStatus(found.user.id),
              activeWorkspaceId: active,
            })
          }),

        setActiveWorkspace: (headers, workspaceId) =>
          Effect.gen(function* () {
            const found = yield* resolve(headers)
            if (!found) return yield* new Unauthenticated()
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
              try: () => db.update(schema.session).set({ activeOrganizationId: workspaceId }).where(eq(schema.session.id, found.session.id)),
              catch: fail('setActiveWorkspace'),
            })
            // The selection lives on the session row (no cookie cache), so no cookie changes.
            return { headers: new Headers() }
          }),
      })
    }),
  )
