/**
 * Worker entry. TanStack Start's default handler plus the Durable Object classes the Worker exports
 * (Cloudflare requires them from the `main` module) and the cron handler. wrangler.jsonc `main` points here.
 */
import handler from '@tanstack/react-start/server-entry'

export { RateLimiter } from '#/server/durable/RateLimiter'

export default {
  ...handler,
  scheduled: (controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) => {
    // Loaded on demand: the server code (Effect, Drizzle, services) must not be evaluated on every request.
    ctx.waitUntil(import('#/server/http/entry.cron').then(({ handleScheduled }) => handleScheduled(controller.cron, env)))
  },
}
