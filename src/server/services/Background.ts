import { Context, Effect, Layer } from 'effect'

/** Schedules work after the response (the Worker's `waitUntil`). */
export type Defer = (run: () => Promise<void>) => void

/**
 * Work that must not hold up or shape the response, such as invitation emails: the request answers first and the
 * send runs after it (`waitUntil`). Failures must be handled inside the effect (log by tag, never the payload).
 * Live layer: `layer(waitUntil)`. Test layer: `inline` (runs before the program continues, so tests can assert).
 */
export class Background extends Context.Service<
  Background,
  {
    readonly run: (effect: Effect.Effect<void>) => Effect.Effect<void>
  }
>()('vizcad/Background') {}

export const layer = (defer: Defer) =>
  Layer.succeed(Background, Background.of({ run: (effect) => Effect.sync(() => defer(() => Effect.runPromise(effect))) }))

export const inline = Layer.succeed(Background, Background.of({ run: (effect) => effect }))
