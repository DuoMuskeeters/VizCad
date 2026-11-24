import { createContext, use, useState, useEffect, useCallback, type ReactNode } from 'react'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales'
import { translations, type I18nKey } from './dict'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: I18nKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const getInitialLocale = (): Locale => {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const saved = localStorage.getItem('vizcad_locale')
    if (saved && (LOCALES as readonly string[]).includes(saved)) {
      return saved as Locale
    }
    const nav = navigator.language?.toLowerCase()
    if (nav?.startsWith('tr')) return 'tr'
    if (nav?.startsWith('de')) return 'de'
    if (nav?.startsWith('es')) return 'es'
    if (nav?.startsWith('fr')) return 'fr'
  } catch {
    // ignore local storage restrictions
  }
  return DEFAULT_LOCALE
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)

  // Read the stored/browser locale after hydration so server and first client render match.
  useEffect(() => {
    if (initialLocale) return
    const detected = getInitialLocale()
    setLocaleState(detected)
    document.documentElement.lang = detected
  }, [initialLocale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('vizcad_locale', newLocale)
      document.documentElement.lang = newLocale
    } catch {
      // ignore
    }
  }, [])

  const t = useCallback(
    (key: I18nKey, params?: Record<string, string | number>): string => {
      const dict = translations[locale] ?? translations.en
      let str: string = dict[key] ?? translations.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return str
    },
    [locale],
  )

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = use(I18nContext)
  if (!ctx) {
    // Fallback if rendered outside provider
    const t = (key: I18nKey, params?: Record<string, string | number>): string => {
      let str: string = translations.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return str
    }
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t,
    }
  }
  return ctx
}
