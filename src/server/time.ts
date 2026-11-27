/**
 * Timestamp units (docs/12 §1.3). Every D1 timestamp is Unix seconds: Drizzle `mode: "timestamp"` writes seconds and
 * the schema has no `timestamp_ms`. Code that reads through a Drizzle column gets a `Date`; every value bound into raw
 * SQL (migrations, scripts, cron thresholds, `notBefore`) goes through `toUnixSeconds`. `Date.now()` is never bound
 * into raw SQL directly.
 */
export const toUnixSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

/** The inverse, for values read from raw SQL. */
export const fromUnixSeconds = (seconds: number): Date => new Date(seconds * 1000)

/** Milliseconds (Clock, `Date.now()`) to Unix seconds. */
export const millisToUnixSeconds = (millis: number): number => Math.floor(millis / 1000)
