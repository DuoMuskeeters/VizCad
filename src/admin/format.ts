/** A Unix-seconds date as a short day (`28 Nov 2026`), in the admin's language. */
export const formatDay = (seconds: number, locale = 'en'): string =>
  new Date(seconds * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
