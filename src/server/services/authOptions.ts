import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { DBFieldAttribute } from 'better-auth/db'
import { organization } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { Redacted } from 'effect'
import * as schema from '../db/schema'
import type { AuthSettings } from './AppConfig'
import { isBanned } from './accountStatus'
import type { GoogleUserInfo } from './googleProfile'
import { SESSION_EXPIRES_IN, SESSION_UPDATE_AGE } from './sessionCookie'

/**
 * Fields VizCad adds to the SDK's organization table. All server-only: `input: false` means no request body
 * can set them (docs/08 §1, security review 2.3); product programs write them with Drizzle, and the D1
 * triggers keep `kind` and the personal owner immutable.
 */
export const organizationFields = {
  kind: { type: 'string', required: false, input: false },
  personalOwnerUserId: { type: 'string', required: false, input: false },
  archivedAt: { type: 'date', required: false, input: false },
  onboardingCompletedAt: { type: 'date', required: false, input: false },
} satisfies Record<string, DBFieldAttribute>

/**
 * Minimal plugin access control. Product authority lives only in permissions.ts; these exist so the SDK
 * knows the five single-valued roles. Organization HTTP routes are never exposed (http/authAllowlist.ts).
 */
const ac = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
} as const)

const roles = {
  owner: ac.newRole({ organization: ['update', 'delete'], member: ['create', 'update', 'delete'], invitation: ['create', 'cancel'] }),
  admin: ac.newRole({ organization: ['update'], member: ['create', 'update', 'delete'], invitation: ['create', 'cancel'] }),
  member: ac.newRole({ organization: [] }),
  commenter: ac.newRole({ organization: [] }),
  guest: ac.newRole({ organization: [] }),
}

export interface AuthMailer {
  readonly verification: (input: { user: { name: string; email: string }; url: string; request: Request | undefined }) => Promise<void>
  readonly passwordReset: (input: { user: { name: string; email: string }; url: string; request: Request | undefined }) => Promise<void>
}

export interface AuthOptionsInput {
  readonly db: DrizzleD1Database<typeof schema>
  readonly settings: AuthSettings
  readonly siteUrl: URL
  readonly trustedOrigins: ReadonlySet<string>
  readonly mailer: AuthMailer
  /** Google's provider-level `getUserInfo` (the pre-account-takeover guard, googleProfile.ts). */
  readonly googleUserInfo: (idToken: string | undefined) => Promise<GoogleUserInfo | null>
}

export { isBanned }

/** better-auth options. Pure (no I/O besides what the adapter does lazily), so tests can inspect them. */
export const authOptions = (input: AuthOptionsInput) => {
  const secure = input.siteUrl.protocol === 'https:'
  const google = input.settings.google
  return {
    appName: 'VizCad',
    baseURL: input.siteUrl.origin,
    basePath: '/api/auth',
    secret: Redacted.value(input.settings.secret),
    trustedOrigins: [...input.trustedOrigins],
    // Explicit schema and no `transaction`: the D1 driver has no interactive transactions (use db.batch).
    database: drizzleAdapter(input.db, { provider: 'sqlite', schema, transaction: false }),
    // Our RateLimit service (Durable Object) counts per endpoint before the SDK; the SDK's own limiter is per isolate.
    rateLimit: { enabled: false },
    // The SDK logs call arguments (e.g. the email address of a failed sign-in). Only its fixed message text may reach logs.
    logger: {
      level: 'error',
      log: (level, message) => {
        if (level === 'error') console.error(`[better-auth] ${message}`)
      },
    },
    // Failed OAuth callbacks redirect here (relative to the site); the UI route arrives with the auth screens.
    onAPIError: { errorURL: '/sign-in' },
    session: {
      // Authority must always come from D1, never from a signed cookie (docs/08 §1).
      cookieCache: { enabled: false },
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
    },
    advanced: {
      useSecureCookies: secure,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: 'lax' },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset ends every other session (docs/08 §1); it never marks the email verified by itself.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }, request) => input.mailer.passwordReset({ user, url, request }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: ({ user, url }, request) => input.mailer.verification({ user, url, request }),
    },
    account: {
      // Never link an existing local account to Google by email (pre-account takeover, review 3.1).
      accountLinking: { enabled: false },
      // Google access/refresh/id tokens are stored encrypted (with the auth secret), never as plain text in D1.
      encryptOAuthTokens: true,
    },
    databaseHooks: {
      session: {
        create: {
          // A banned user gets no session, by any route (password, Google callback). An expired ban does not block.
          before: async (session) => {
            const [row] = await input.db
              .select({ banned: schema.user.banned, banExpires: schema.user.banExpires })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1)
            return isBanned(row) ? false : { data: session }
          },
        },
      },
    },
    user: {
      // Account deletion is off in the first phase (docs/08 §2).
      deleteUser: { enabled: false },
    },
    socialProviders: google._tag === 'Some'
      ? {
          google: {
            clientId: google.value.clientId,
            clientSecret: Redacted.value(google.value.clientSecret),
            getUserInfo: (token: { idToken?: string | undefined }) => input.googleUserInfo(token.idToken),
          },
        }
      : {},
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        allowUserToCreateOrganization: false,
        requireEmailVerificationOnInvitation: true,
        teams: { enabled: false },
        dynamicAccessControl: { enabled: false },
        schema: { organization: { additionalFields: organizationFields } },
      }),
    ],
  } satisfies BetterAuthOptions
}

export const createAuth = (input: AuthOptionsInput) => betterAuth(authOptions(input))
