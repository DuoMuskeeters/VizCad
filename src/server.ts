/**
 * Worker entry. TanStack Start's default handler plus the Durable Object classes the Worker exports
 * (Cloudflare requires them from the `main` module) and the cron handler. wrangler.jsonc `main` points here.
 */
import handler from '@tanstack/react-start/server-entry'
import { handleScheduled } from '#/server/http/entry'

export { RateLimiter } from '#/server/durable/RateLimiter'

export default {
  ...handler,
  scheduled: (controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) => {
    ctx.waitUntil(handleScheduled(controller.cron, env))
  },
}
