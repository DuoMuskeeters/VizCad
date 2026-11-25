import { Context, Layer, Option, Redacted } from 'effect'
import type { RateLimitRule } from './rateLimitWindow'

/** S3-API access to R2, used only to presign URLs (browser uploads/downloads go straight to R2). */
export interface R2Presign {
  readonly endpoint: URL
  readonly bucketName: string
  readonly accessKeyId: string
  readonly secretAccessKey: Redacted.Redacted<string>
}

/** Cloudflare API access for purging the edge cache across the zone (D4). */
export interface CachePurge {
  readonly zoneId: string
  readonly token: Redacted.Redacted<string>
}

/** Operations the shared RateLimit service protects (docs/08 §1). Each has a per-target and a per-IP counter. */
export const rateLimitActions = ['signIn', 'signUp', 'passwordReset', 'verificationEmail', 'invite', 'inviteAccept', 'inviteLookup', 'createWorkspace', 'upload', 'linkOpen', 'linkPassword', 'thumbnailPut', 'comment'] as const
export type RateLimitAction = (typeof rateLimitActions)[number]

export type { RateLimitRule }

export interface RateLimitRules {
  /** Counter keyed by the normalized target (email address, link id, ...). */
  readonly target: RateLimitRule
  /** Counter keyed by the client IP. */
  readonly ip: RateLimitRule
}

/** Identity layer settings (better-auth). */
export interface AuthSettings {
  /** `BETTER_AUTH_SECRET` (the production secret keeps its old name so existing sessions stay valid). */
  readonly secret: Redacted.Redacted<string>
  /** None when Google sign-in is not configured. */
  readonly google: Option.Option<{ readonly clientId: string; readonly clientSecret: Redacted.Redacted<string> }>
}

/** Limits per action; defaults live in AppConfig.live.ts. */
export const defaultRateLimits: Record<RateLimitAction, RateLimitRules> = {
  signIn: { target: { limit: 10, windowSeconds: 15 * 60 }, ip: { limit: 30, windowSeconds: 15 * 60 } },
  signUp: { target: { limit: 3, windowSeconds: 60 * 60 }, ip: { limit: 10, windowSeconds: 60 * 60 } },
  passwordReset: { target: { limit: 3, windowSeconds: 60 * 60 }, ip: { limit: 10, windowSeconds: 60 * 60 } },
  verificationEmail: { target: { limit: 3, windowSeconds: 60 * 60 }, ip: { limit: 10, windowSeconds: 60 * 60 } },
  // Invitation sends. The target is the workspace; its daily quota comes from Entitlements (`targetRule`), this is the fallback.
  invite: { target: { limit: 50, windowSeconds: 24 * 60 * 60 }, ip: { limit: 60, windowSeconds: 60 * 60 } },
  // Invitation acceptance (guest tokens are secrets): per IP before the token is hashed and looked up.
  inviteAccept: { target: { limit: 10, windowSeconds: 15 * 60 }, ip: { limit: 30, windowSeconds: 15 * 60 } },
  // Reading an invitation card before accepting: the same per-IP and per-account scope as acceptance, with room to reload the page.
  inviteLookup: { target: { limit: 60, windowSeconds: 15 * 60 }, ip: { limit: 120, windowSeconds: 15 * 60 } },
  // Workspace creation. The target is the user; its daily quota comes from Entitlements (`targetRule`), this is the fallback.
  createWorkspace: { target: { limit: 10, windowSeconds: 24 * 60 * 60 }, ip: { limit: 20, windowSeconds: 60 * 60 } },
  // Upload requests (`requestUpload`): per user and per IP. A drag-and-drop of a few dozen files must fit; the open-session
  // count and the storage reservation (Entitlements) bound what is actually held.
  upload: { target: { limit: 120, windowSeconds: 60 * 60 }, ip: { limit: 240, windowSeconds: 60 * 60 } },
  // New comments (`addComment`): per user and per IP; generous for a review session, tight enough to stop a flood.
  comment: { target: { limit: 60, windowSeconds: 60 * 60 }, ip: { limit: 120, windowSeconds: 60 * 60 } },
  // Opening a share link page (docs/09 §4.5): per IP, before the token is hashed and looked up. The target (a link) is not used.
  linkOpen: { target: { limit: 600, windowSeconds: 15 * 60 }, ip: { limit: 120, windowSeconds: 15 * 60 } },
  // Link password tries. The target is `<ip>|<link digest>` (one visitor on one link), so a stranger cannot lock the real
  // recipient out; the IP counter bounds guessing across links. Turnstile joins in after three failures (programs/shareLinks.ts).
  linkPassword: { target: { limit: 10, windowSeconds: 15 * 60 }, ip: { limit: 30, windowSeconds: 15 * 60 } },
  // Thumbnail uploads (`putThumbnail`): per user.
  thumbnailPut: { target: { limit: 120, windowSeconds: 60 * 60 }, ip: { limit: 240, windowSeconds: 60 * 60 } },
}

/**
 * Keys that protect share links (docs/09 §4.1, §4.2). Both are optional in the environment; the programs that need
 * them fail with ConfigError when they are missing, the rest of the app keeps working.
 */
export interface ShareTokenKeys {
  /** The version new links are encrypted with: the highest version in `SHARE_TOKEN_KEYS`. */
  readonly active: number
  /** Version to 32-byte AES-GCM key. Old versions stay until no link row uses them any more. */
  readonly keys: ReadonlyMap<number, Redacted.Redacted<Uint8Array>>
}

/**
 * Typed, validated configuration. Business code reads config only through this service, never
 * `process.env` or `env.X`. Live layer: AppConfig.live.ts (decodes the Worker env).
 */
export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly siteUrl: URL
    readonly email: {
      readonly from: string
      readonly fromName: string
      /**
       * Staging only: Email sends to these recipients (exact addresses, or `@domain` entries) and logs and skips
       * everyone else. None in production, where it is never read (docs/08 uygulama notları · Faz 3b).
       */
      readonly allowlist: Option.Option<ReadonlySet<string>>
    }
    /** Origins allowed to make state-changing requests (CSRF) and used as better-auth trusted origins. Always includes the site origin. */
    readonly trustedOrigins: ReadonlySet<string>
    /** None when `BETTER_AUTH_SECRET` is not configured: the Auth layer then fails with ConfigError. */
    readonly auth: Option.Option<AuthSettings>
    readonly rateLimits: Record<RateLimitAction, RateLimitRules>
    readonly turnstile: {
      readonly secret: Redacted.Redacted<string>
      /** Frontend hostnames siteverify may report. Production must not include localhost. */
      readonly hostnames: ReadonlySet<string>
    }
    /** None when R2 S3 credentials are not configured (e.g. local dev): presigning fails with ConfigError. */
    readonly r2Presign: Option.Option<R2Presign>
    /** None when not configured: purge only clears the local data center's cache. */
    readonly cachePurge: Option.Option<CachePurge>
    /** `SHARE_TOKEN_KEYS`: versioned AES-GCM keys that encrypt the copyable link token. None when not configured. */
    readonly shareTokenKeys: Option.Option<ShareTokenKeys>
    /** `SHARE_PROOF_KEY` (at least 32 bytes): HMAC key for link password proof cookies and delivery audit ids. None when not configured. */
    readonly shareProofKey: Option.Option<Redacted.Redacted<Uint8Array>>
    /** Days `security_log` rows are kept (D21: 90, not plan dependent). The daily job deletes older rows. */
    readonly securityLogRetentionDays: number
    /**
     * Unix seconds (`TRASH_RETENTION_FLOOR`, 0 when unset). A trashed file's retention counts from
     * `max(deletedAt or updatedAt, floor)`, so legacy trash (kept forever by the old app) is not purged in bulk at cutover.
     * Production: set to the cutover time.
     */
    readonly trashRetentionFloor: number
  }
>()('vizcad/AppConfig') {}

/** Fixed values for tests. Override any field with `test({ ... })`. */
export const testConfig: AppConfig['Service'] = {
  siteUrl: new URL('https://vizcad.test'),
  email: { from: 'noreply@vizcad.test', fromName: 'VizCad', allowlist: Option.none() },
  trustedOrigins: new Set(['https://vizcad.test']),
  auth: Option.some({
    secret: Redacted.make('test-better-auth-secret-0123456789abcdef'),
    google: Option.some({ clientId: 'test-google-client', clientSecret: Redacted.make('test-google-secret') }),
  }),
  rateLimits: defaultRateLimits,
  turnstile: { secret: Redacted.make('test-turnstile-secret'), hostnames: new Set(['vizcad.test']) },
  r2Presign: Option.some({
    endpoint: new URL('https://account.r2.cloudflarestorage.com'),
    bucketName: 'vizcad-files-test',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: Redacted.make('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'),
  }),
  cachePurge: Option.none(),
  shareTokenKeys: Option.some({
    active: 2,
    keys: new Map([
      [1, Redacted.make(new Uint8Array(32).fill(1))],
      [2, Redacted.make(new Uint8Array(32).fill(2))],
    ]),
  }),
  shareProofKey: Option.some(Redacted.make(new Uint8Array(32).fill(7))),
  securityLogRetentionDays: 90,
  trashRetentionFloor: 0,
}

export const test = (overrides: Partial<AppConfig['Service']> = {}) =>
  Layer.succeed(AppConfig, AppConfig.of({ ...testConfig, ...overrides }))
