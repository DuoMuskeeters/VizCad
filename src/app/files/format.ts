import type { Locale } from '#/i18n'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** "12,4 MB": decimal units like the mockups, one decimal from MB up. */
export const formatBytes = (bytes: number, locale: Locale | string = 'en'): string => {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit++
  }
  const digits = unit >= 2 && value < 100 ? 1 : 0
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${UNITS[unit]}`
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** "14:20" today, a weekday name within the last week, otherwise "19 Nov" (with year when it is another year). */
export const formatWhen = (seconds: number, locale: string, now: Date = new Date()): string => {
  const date = new Date(seconds * 1000)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  if (days === 1) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day')
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export const formatDateTime = (seconds: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(seconds * 1000))

export const formatDay = (seconds: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(seconds * 1000))

/** Upper-case type tile text: "STEP", "STL". */
export const tileText = (extension: string): string => extension.toUpperCase().slice(0, 4)
