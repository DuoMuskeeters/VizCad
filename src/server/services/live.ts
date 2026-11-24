import { Layer } from 'effect'
import * as AppConfigLive from './AppConfig.live'
import * as AuthLive from './Auth.live'
import * as Background from './Background'
import * as CacheLive from './Cache.live'
import type { CacheBinding } from './Cache.live'
import * as DbLive from './Db.live'
import * as EmailLive from './Email.live'
import * as Entitlements from './Entitlements'
import * as RateLimitLive from './RateLimit.live'
import * as StorageLive from './Storage.live'
import * as TurnstileLive from './Turnstile.live'

// The DOM lib's CacheStorage type hides the Workers-only `caches.default`; this declares the Workers
// shape for this module only. No code is emitted: at runtime it is the Worker global.
declare const caches: { readonly default: CacheBinding }

/**
 * Live layers built from the Worker env. The only place outside a single service file that touches
 * bindings. Handlers merge just the layers their program needs, so a page that only reads D1 does
 * not fail because, say, Turnstile is unconfigured. Layers sharing `config` build it once per request.
 */
export const liveLayers = (env: Cloudflare.Env, defer?: AuthLive.Defer) => {
  const config = AppConfigLive.fromEnv(env)
  const email = EmailLive.layer(env.EMAIL).pipe(Layer.provide(config))
  return {
    config,
    db: DbLive.layer(env.vizcad_auth),
    storage: StorageLive.layer(env.R2_FILES_BUCKET).pipe(Layer.provide(config)),
    email,
    auth: AuthLive.layer(env.vizcad_auth, defer).pipe(Layer.provide(Layer.merge(config, email))),
    rateLimit: RateLimitLive.layer(env.RATE_LIMITER).pipe(Layer.provide(config)),
    turnstile: TurnstileLive.layer.pipe(Layer.provide(config)),
    cache: CacheLive.layer(caches.default).pipe(Layer.provide(config)),
    entitlements: Entitlements.live,
    background: Background.layer(defer ?? AuthLive.detached),
  }
}
