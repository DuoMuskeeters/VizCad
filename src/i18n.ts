import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "@/locales/en.json"
import tr from "@/locales/tr.json"
import de from "@/locales/de.json"
import es from "@/locales/es.json"
import fr from "@/locales/fr.json"
import hi from "@/locales/hi.json"

// Browser language detection
const getBrowserLanguage = (): string => {
  if (typeof window === "undefined") return "en"

  // 1. localStorage'dan kontrol et
  const savedLang = localStorage.getItem('vizcad-language')
  if (savedLang === 'tr' || savedLang === 'en' || savedLang === 'de' || savedLang === 'es' || savedLang === 'fr' || savedLang === 'hi') {
    return savedLang
  }

  // 2. Browser dilinden kontrol et
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('tr')) {
    return 'tr'
  }
  if (browserLang.startsWith('de')) {
    return 'de'
  }
  if (browserLang.startsWith('es')) {
    return 'es'
  }
  if (browserLang.startsWith('fr')) {
    return 'fr'
  }
  if (browserLang.startsWith('hi')) {
    return 'hi'
  }

  // 3. Default olarak İngilizce
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
      de: { translation: de },
      es: { translation: es },
      fr: { translation: fr },
      hi: { translation: hi },
    },
    lng: getBrowserLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })

export default i18n
