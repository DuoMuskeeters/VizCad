import { Context, Effect, Layer } from 'effect'
import { CaptchaFailed } from '../errors'

export interface VerifyRequest {
  readonly token: string
  /** The widget's `data-action` for this surface (e.g. "signup"); siteverify must report the same. */
  readonly action: string
  readonly ip: string | null
}

/**
 * Verifies Cloudflare Turnstile tokens: success, expected action and an approved hostname.
 * Live layer: Turnstile.live.ts (siteverify). Test layer: `test`.
 */
export class Turnstile extends Context.Service<
  Turnstile,
  {
    readonly verify: (request: VerifyRequest) => Effect.Effect<void, CaptchaFailed>
  }
>()('vizcad/Turnstile') {}

/** Test implementation: accepts every token except "fail". */
export const test = Layer.succeed(
  Turnstile,
  Turnstile.of({
    verify: ({ token }) => (token === 'fail' ? Effect.fail(new CaptchaFailed({ reason: 'test-rejected' })) : Effect.void),
  }),
)
