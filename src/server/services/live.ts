import { Context, Effect, Exit, Layer, Scope } from 'effect'
import type { AppError } from '../errors'
import * as AppConfigLive from './AppConfig.live'
import * as AuthLive from './Auth.live'
import * as Background from './Background'
import * as CacheLive from './Cache.live'
import * as DbLive from './Db.live'
import * as EmailLive from './Email.live'
import * as Entitlements from './Entitlements'
import * as RateLimitLive from './RateLimit.live'
import * as StorageLive from './Storage.live'
import * as TurnstileLive from './Turnstile.live'

/**
 * Builds a layer once per Worker isolate. Every request that provides the result gets the same already-built context, so
 * config decoding and service construction happen on the first request only. A failed build (bad config) is not kept: the
 * next request tries again. The scope lives as long as the isolate.
 */
const once = <R>(layer: Layer.Layer<R, AppError>): Layer.Layer<R, AppError> => {
  const scope = Scope.makeUnsafe()
  let built: Promise<Exit.Exit<Context.Context<R>, AppError>> | undefined
  return Layer.effectContext(
    Effect.suspend(() => {
      built ??= Effect.runPromiseExit(Layer.buildWithScope(layer, scope))
      const current = built
      return Effect.promise(() => current).pipe(
        Effect.flatMap((exit) => {
          if (Exit.isFailure(exit)) built = built === current ? undefined : built
          return exit
        }),
      )
    }),
  )
}

const build = (env: Cloudflare.Env, defer: AuthLive.Defer | undefined) => {
  const config = once(AppConfigLive.fromEnv(env))
  const db = once(DbLive.layer(env.vizcad_auth))
  const email = once(EmailLive.layer(env.EMAIL).pipe(Layer.provide(config)))
  return {
    config,
    db,
    storage: once(StorageLive.layer(env.R2_FILES_BUCKET).pipe(Layer.provide(config))),
    email,
    auth: once(AuthLive.layer(env.vizcad_auth, defer).pipe(Layer.provide(Layer.merge(config, email)))),
    rateLimit: once(RateLimitLive.layer(env.RATE_LIMITER).pipe(Layer.provide(config))),
    turnstile: once(TurnstileLive.layer.pipe(Layer.provide(config))),
    cache: once(CacheLive.layer.pipe(Layer.provide(config))),
    entitlements: once(Entitlements.live.pipe(Layer.provide(db))),
    background: Background.layer(defer ?? AuthLive.detached),
  }
}

const perEnv = new WeakMap<object, Map<AuthLive.Defer | undefined, ReturnType<typeof build>>>()

/**
 * Live layers built from the Worker env. The only place outside a single service file that touches bindings. Handlers
 * merge just the layers their program needs, so a page that only reads D1 does not fail because, say, Turnstile is
 * unconfigured. The set is built once per isolate and env object (a different env gets a fresh set), and each layer is
 * memoized (`once`), so config is decoded once. `defer` must be a stable function (see
 * `deferOf` in http/entry.app.ts): the set is memoized per env and `defer`.
 */
export const liveLayers = (env: Cloudflare.Env, defer?: AuthLive.Defer) => {
  const byDefer = perEnv.get(env) ?? new Map<AuthLive.Defer | undefined, ReturnType<typeof build>>()
  perEnv.set(env, byDefer)
  let layers = byDefer.get(defer)
  if (layers === undefined) {
    layers = build(env, defer)
    byDefer.set(defer, layers)
  }
  return layers
}
