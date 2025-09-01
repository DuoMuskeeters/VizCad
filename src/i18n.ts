import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "@/locales/en.json"
import tr from "@/locales/tr.json"

// Browser language detection
const getBrowserLanguage = (): string => {
  if (typeof window === "undefined") return "en"

  // 1. localStorage'dan kontrol et
  const savedLang = localStorage.getItem('vizcad-language')
  if (savedLang === 'tr' || savedLang === 'en') {
    return savedLang
  }

  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
    },
    lng: getBrowserLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })

export default i18n
