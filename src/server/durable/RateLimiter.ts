import { DurableObject } from 'cloudflare:workers'
import { advance, type CounterResult, isValidRule, type RateLimitRule, type WindowState } from '../services/rateLimitWindow'

const KEY = 'window'

/**
 * One fixed-window counter per Durable Object instance (the instance name is a SHA-256 of the action,
 * scope and target, never the raw value). Strongly consistent across regions, unlike the Workers
 * Rate Limiting binding. Only RateLimit.live.ts calls `hit`; there is no fetch handler. The window's
 * state is deleted by an alarm once the window has ended, so idle counters leave nothing behind.
 */
export class RateLimiter extends DurableObject<Cloudflare.Env> {
  async hit(rule: RateLimitRule): Promise<CounterResult> {
    if (!isValidRule(rule)) return { allowed: false, retryAfterSeconds: 60 }
    const now = Date.now()
    const previous = await this.ctx.storage.get<WindowState>(KEY)
    const next = advance(previous, now, rule)
    if (next.result.allowed) {
      await this.ctx.storage.put(KEY, next.state)
      if (previous === undefined || previous.windowStart !== next.state.windowStart) {
        await this.ctx.storage.setAlarm(next.state.windowStart + rule.windowSeconds * 1000 + 1000)
      }
    }
    return next.result
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
