import { useEffect } from "react"
// If SupportedLang is not exported, define it locally (adjust as needed):
type SupportedLang = 'en' | 'fr' | 'de' | 'es' | 'tr' | 'hi'; // Add all supported language codes here

import { detectLanguage, seoContent } from "@/utils/language"

export default function SeoUpdater() {
  useEffect(() => {
    // update meta tags when language changes (client-side)
    const applySeo = (lang: SupportedLang) => {
      const content = seoContent[lang] || seoContent['en']
      
      // Update document title
      document.title = content.home.title

      const setMeta = (name: string, value: string | undefined) => {
        if (!value) return
        let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
        if (!el) {
          el = document.createElement('meta')
          el.setAttribute('name', name)
          document.head.appendChild(el)
        }
        el.setAttribute('content', value)
      }

      // Update standard meta tags
      setMeta('description', content.home.description)
      setMeta('keywords', content.home.keywords)
      setMeta('twitter:title', content.home.twitterTitle)
      setMeta('twitter:description', content.home.twitterDescription)

      // Update Open Graph meta tags
      const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null
      if (ogTitle) ogTitle.setAttribute('content', content.home.ogTitle || '')
      
      const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null
      if (ogDesc) ogDesc.setAttribute('content', content.home.ogDescription || '')

      // Update locale
      const ogLocale = document.querySelector('meta[property="og:locale"]') as HTMLMetaElement | null
      if (ogLocale) ogLocale.setAttribute('content', content.root.locale || 'en_US')
    }

    // apply immediately
    const lang = detectLanguage()
    applySeo(lang as SupportedLang)

    // observe localStorage changes to vizcad-language (other tabs)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'vizcad-language') {
        const newLang = (e.newValue || 'en') as SupportedLang
        applySeo(newLang)
      }
    }

    // Also listen for cookie changes (though less reliable)
    const checkCookieChange = () => {
      const currentLang = detectLanguage()
      applySeo(currentLang as SupportedLang)
    }

    window.addEventListener('storage', onStorage)
    // Check for cookie changes periodically (fallback)
    const cookieCheckInterval = setInterval(checkCookieChange, 1000)

    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(cookieCheckInterval)
    }
  }, [])

  return null
}