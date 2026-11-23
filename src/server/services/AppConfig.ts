import { Context, Layer, Option, Redacted } from 'effect'

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

/**
 * Typed, validated configuration. Business code reads config only through this service, never
 * `process.env` or `env.X`. Live layer: AppConfig.live.ts (decodes the Worker env).
 */
export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly siteUrl: URL
    readonly email: { readonly from: string; readonly fromName: string }
    readonly turnstileSecret: Redacted.Redacted<string>
    /** None when R2 S3 credentials are not configured (e.g. local dev): presigning fails with ConfigError. */
    readonly r2Presign: Option.Option<R2Presign>
    /** None when not configured: purge only clears the local data center's cache. */
    readonly cachePurge: Option.Option<CachePurge>
  }
>()('vizcad/AppConfig') {}

/** Fixed values for tests. Override any field with `test({ ... })`. */
export const testConfig: AppConfig['Service'] = {
  siteUrl: new URL('https://vizcad.test'),
  email: { from: 'noreply@vizcad.test', fromName: 'VizCad' },
  turnstileSecret: Redacted.make('test-turnstile-secret'),
  r2Presign: Option.some({
    endpoint: new URL('https://account.r2.cloudflarestorage.com'),
    bucketName: 'vizcad-files-bucket',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: Redacted.make('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'),
  }),
  cachePurge: Option.none(),
}

export const test = (overrides: Partial<AppConfig['Service']> = {}) =>
  Layer.succeed(AppConfig, AppConfig.of({ ...testConfig, ...overrides }))
