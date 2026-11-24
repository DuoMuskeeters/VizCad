import { Effect, Option, Schema } from 'effect'

/**
 * Google sign-in guard (docs/08 §1, security review 3.1: pre-account takeover). better-auth calls this
 * as the provider's `getUserInfo`, after Google has verified the code and before the SDK writes any identity.
 * It answers `null` (the SDK then redirects with an error, no session) unless:
 *  - the ID token carries a verified Google email, and
 *  - no account with that email already exists with an UNverified email.
 * Linking an existing account by email is separately off (`accountLinking.enabled = false`), so the only ways in
 * are a verified account that Google already created, or a brand new verified Google account.
 */
const Claims = Schema.Struct({
  sub: Schema.String,
  email: Schema.String,
  email_verified: Schema.Union([Schema.Boolean, Schema.Literals(['true', 'false'])]),
  name: Schema.optional(Schema.String),
  picture: Schema.optional(Schema.String),
})

export interface GoogleUserInfo {
  readonly user: {
    readonly id: string
    readonly name: string
    readonly email: string
    readonly image?: string
    readonly emailVerified: true
  }
  readonly data: unknown
}

/** An existing user with this (lowercase) email: None, or whether its email is verified. */
export type FindUserByEmail = (email: string) => Effect.Effect<Option.Option<{ readonly emailVerified: boolean }>, unknown>

const decodeBase64Url = (segment: string) =>
  Effect.try({
    try: () => {
      const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))) as unknown
    },
    catch: () => 'malformed-id-token' as const,
  })

export const googleUserInfo = (idToken: string | undefined, findUser: FindUserByEmail) =>
  Effect.gen(function* () {
    const payload = (idToken ?? '').split('.')[1]
    if (payload === undefined) return null
    const claims = yield* decodeBase64Url(payload).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Claims)))
    if (claims.email_verified !== true && claims.email_verified !== 'true') return null
    const email = claims.email.trim().toLowerCase()
    const existing = yield* findUser(email)
    if (Option.isSome(existing) && !existing.value.emailVerified) return null
    return {
      user: {
        id: claims.sub,
        name: claims.name ?? email,
        email,
        ...(claims.picture === undefined ? {} : { image: claims.picture }),
        emailVerified: true as const,
      },
      data: claims,
    } satisfies GoogleUserInfo
  }).pipe(
    // Anything unexpected (bad token, database trouble) is a refusal, never a sign-in.
    Effect.catch(() => Effect.succeed(null)),
  )
