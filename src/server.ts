/**
 * Worker entry. TanStack Start's default handler plus the Durable Object classes the Worker exports
 * (Cloudflare requires them from the `main` module). wrangler.jsonc `main` points here.
 */
import handler from '@tanstack/react-start/server-entry'

export { RateLimiter } from '#/server/durable/RateLimiter'
export default handler
