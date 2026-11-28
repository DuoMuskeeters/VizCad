import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Logo } from '#/components/ui/Logo'
import type { Locale } from '#/i18n/locales'
import { localeOfPath, localizedPath } from '#/shared/marketingRoutes'
import { LanguageLinks, LanguageMenu } from './LanguageSwitcher'

/**
 * Marketing page frame (top bar and footer). Identical for every visitor: it never reads cookies or the session, so
 * the edge-cached HTML is the same for signed-in and anonymous people (docs/12 §7.1). Links between marketing pages
 * are full page loads (plain anchors), so every navigation is served from the edge cache. The language menu (header) and the
 * language links (footer) go to the same page in another locale.
 * Placeholder look until the landing design (6f); the CPU probe uses it as the shell of a real marketing page.
 */
export function MarketingShell({ children, alternates }: { children: ReactNode; alternates?: Readonly<Partial<Record<Locale, string>>> }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const home = localizedPath(localeOfPath(pathname), '/')
  const linkBase = 'inline-flex min-h-11 items-center whitespace-nowrap rounded-md text-sm text-text-2 hover:bg-hover hover:text-text'
  const link = `${linkBase} px-3`
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="border-b border-line">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center justify-between gap-1 px-4 py-2 sm:gap-2">
          <a href={home} className="inline-flex min-h-11 items-center">
            <Logo />
          </a>
          {/* Tight below `sm`: logo, language, sign in and start free must fit 320 px with the 16 px gutters. */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <LanguageMenu {...(alternates === undefined ? {} : { alternates })} />
            <a href="/sign-in" className={`${linkBase} px-2 sm:px-3`}>
              Sign in
            </a>
            <a href="/sign-up" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md bg-accent px-2 text-sm sm:px-3 font-medium text-on-accent hover:bg-accent-hover">
              Start free
            </a>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-text-3">
          <LanguageLinks {...(alternates === undefined ? {} : { alternates })} />
        </div>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 pb-4 text-sm text-text-3">
          <span>© VizCad</span>
          <div className="flex flex-wrap gap-1">
            <a href="/legal/privacy" className={link}>
              Privacy
            </a>
            <a href="/legal/terms" className={link}>
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
