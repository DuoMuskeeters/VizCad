/**
 * Fixed-window counting, shared by the in-memory RateLimit layer and the Durable Object so both behave
 * the same. Pure: no clock, no I/O. Times are milliseconds.
 */
export interface RateLimitRule {
  readonly limit: number
  readonly windowSeconds: number
}

export interface WindowState {
  readonly windowStart: number
  readonly count: number
}

export interface CounterResult {
  readonly allowed: boolean
  /** Seconds until the window ends; 0 when allowed. */
  readonly retryAfterSeconds: number
}

/** A counter that was never hit, or whose window ended, starts a new window. Denied hits are not counted. */
export const advance = (
  state: WindowState | undefined,
  now: number,
  rule: RateLimitRule,
): { readonly state: WindowState; readonly result: CounterResult } => {
  const windowMs = rule.windowSeconds * 1000
  const current = state !== undefined && now >= state.windowStart && now < state.windowStart + windowMs ? state : { windowStart: now, count: 0 }
  if (current.count >= rule.limit) {
    return { state: current, result: { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.windowStart + windowMs - now) / 1000)) } }
  }
  return { state: { windowStart: current.windowStart, count: current.count + 1 }, result: { allowed: true, retryAfterSeconds: 0 } }
}

export const isValidRule = (rule: RateLimitRule) =>
  Number.isInteger(rule.limit) && rule.limit >= 0 && Number.isInteger(rule.windowSeconds) && rule.windowSeconds >= 1 && rule.windowSeconds <= 86_400
