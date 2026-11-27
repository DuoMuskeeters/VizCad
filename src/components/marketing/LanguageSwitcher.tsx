import { useRouterState } from '@tanstack/react-router'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { LOCALES, LOCALE_NAMES, type Locale } from '#/i18n/locales'
import { localeOfPath, switchLocalePath } from '#/shared/marketingRoutes'

interface Props {
  /** The page's live locales and their paths (posts have a slug per locale). Without it the path maps by prefix. */
  readonly alternates?: Readonly<Partial<Record<Locale, string>>>
}

const useLinks = (alternates: Props['alternates']) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const current = localeOfPath(pathname)
  return { current, links: LOCALES.map((locale) => ({ locale, href: switchLocalePath(pathname, locale, alternates) })) }
}

/** "Language" in each locale (the page's own language, from its URL, not the app preference). */
const LANGUAGE_LABEL: Readonly<Record<Locale, string>> = { en: 'Language', tr: 'Dil', de: 'Sprache', es: 'Idioma', fr: 'Langue' }

const item = 'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm hover:bg-hover hover:text-text'

/**
 * Header language menu (docs/12 §1.2, K2): links, not a script. Each goes to the same page in that locale, or to that
 * locale's home when the page does not exist there. Works without JavaScript (`<details>`); no automatic redirect.
 * The app's own language preference (`vizcad_locale`) is separate and never changes the URL.
 */
export function LanguageMenu({ alternates }: Props) {
  const { current, links } = useLinks(alternates)
  return (
    <details className="group relative">
      <summary className="inline-flex min-h-11 min-w-11 justify-center cursor-pointer list-none items-center gap-1.5 rounded-md px-3 text-sm text-text-2 hover:bg-hover hover:text-text [&::-webkit-details-marker]:hidden">
        <Globe aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{LOCALE_NAMES[current]}</span>
        <span className="sr-only">, {LANGUAGE_LABEL[current].toLowerCase()}</span>
        <ChevronDown aria-hidden className="hidden size-4 transition-transform group-open:rotate-180 sm:block" />
      </summary>
      <ul className="absolute right-0 z-10 mt-1 grid w-44 max-w-[calc(100vw-24px)] gap-0.5 rounded-lg border border-line bg-bg p-1.5 shadow-pop">
        {links.map(({ locale, href }) => (
          <li key={locale}>
            <a href={href} hrefLang={locale} lang={locale} aria-current={locale === current ? 'true' : undefined} className={`${item} ${locale === current ? 'font-medium text-text' : 'text-text-2'}`}>
              <span className="flex-1">{LOCALE_NAMES[locale]}</span>
              {locale === current ? <Check aria-hidden className="size-4" /> : null}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Footer language links: the same targets as the menu, always visible. */
export function LanguageLinks({ alternates }: Props) {
  const { current, links } = useLinks(alternates)
  return (
    <nav aria-label={LANGUAGE_LABEL[current]}>
      <ul className="-mx-3 flex flex-wrap gap-1">
        {links.map(({ locale, href }) => (
          <li key={locale}>
            <a href={href} hrefLang={locale} lang={locale} aria-current={locale === current ? 'true' : undefined} className={`${item} ${locale === current ? 'font-medium text-text' : 'text-text-2'}`}>
              {LOCALE_NAMES[locale]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
