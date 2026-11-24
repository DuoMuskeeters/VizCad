export const LOCALES = ['en', 'tr', 'de', 'es', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
}

export const DEFAULT_LOCALE: Locale = 'en'
