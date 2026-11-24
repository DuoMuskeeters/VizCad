import type { ReactNode } from 'react'
import { FolderKanban, Globe, Link as LinkIcon, Activity } from 'lucide-react'
import { Logo } from '#/components/ui/Logo'
import { Avatar } from '#/components/ui/Avatar'
import { Badge } from '#/components/ui/Badge'
import { LOCALES, LOCALE_NAMES, useI18n, type Locale } from '#/i18n'

const LanguageSelect = () => {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="relative inline-flex h-11 items-center gap-1.5 rounded-md px-2.5 text-md font-medium text-text-2 hover:bg-hover hover:text-text">
      <Globe aria-hidden className="size-4" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-11 cursor-pointer appearance-none bg-transparent pr-1 text-md font-medium text-inherit focus-visible:outline-offset-2"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  )
}

const SidePanel = () => {
  const { t } = useI18n()
  const facts = [
    { Icon: FolderKanban, text: t('auth.side.fact1') },
    { Icon: LinkIcon, text: t('auth.side.fact2') },
    { Icon: Activity, text: t('auth.side.fact3') },
  ]
  return (
    <aside className="hidden flex-col gap-7 border-r border-line bg-surface px-12 pb-10 pt-8 min-[960px]:flex">
      <Logo alt="VizCad" className="text-[28px]" />
      <div className="mt-auto max-w-115">
        <h2 className="text-2xl font-semibold tracking-heading">{t('auth.side.heading')}</h2>
        <p className="mt-2.5 text-text-2">{t('auth.side.description')}</p>
      </div>
      <figure className="max-w-115 overflow-hidden rounded-lg border border-line bg-bg" aria-hidden>
        <div className="flex h-11 items-center gap-2.5 border-b border-line px-3.5 text-md">
          <b className="font-semibold">{t('auth.side.fileName')}</b>
          <span className="text-sm text-text-3">{t('auth.side.fileVersion')}</span>
        </div>
        <div className="flex gap-2.5 px-3.5 py-3 text-md leading-snug">
          <Avatar name={t('auth.side.commentAuthor')} />
          <p>
            <b className="font-semibold">{t('auth.side.commentAuthor')}</b>
            <Badge tone="guest" className="ml-1.5">{t('auth.side.commentBadge')}</Badge>
            <br />
            {t('auth.side.commentText')}
          </p>
        </div>
      </figure>
      <ul className="mb-auto grid max-w-115 gap-3">
        {facts.map(({ Icon, text }) => (
          <li key={text} className="flex gap-3 text-md leading-normal text-text-2">
            <Icon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Shared frame of every auth screen: mobile column first, product panel from 960px. */
export const AuthLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n()
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-bg text-text min-[960px]:grid-cols-2">
      <SidePanel />
      <div className="flex min-w-0 flex-col">
        <header className="flex h-15 items-center justify-between pl-4 pr-2 min-[960px]:justify-end min-[960px]:px-6">
          <a href="/" className="rounded-sm min-[960px]:hidden" aria-label="VizCad">
            <Logo alt="" className="text-[24px]" />
          </a>
          <LanguageSelect />
        </header>
        <main className="mx-auto w-full max-w-100 px-4 pb-10 pt-5 min-[960px]:m-auto min-[960px]:px-6 min-[960px]:pt-6">{children}</main>
        <footer className="flex flex-wrap justify-center gap-x-4 px-4 pb-5 text-sm text-text-3 min-[960px]:mt-0">
          <a href="/legal/privacy" className="py-3 hover:text-text">
            {t('auth.footer.privacy')}
          </a>
          <a href="/legal/terms" className="py-3 hover:text-text">
            {t('auth.footer.terms')}
          </a>
          <a href="/contact" className="py-3 hover:text-text">
            {t('auth.footer.help')}
          </a>
        </footer>
      </div>
    </div>
  )
}

export const AuthHeading = ({ title, lead }: { title: ReactNode; lead?: ReactNode }) => (
  <div>
    <h1 className="text-2xl font-semibold leading-tight tracking-heading">{title}</h1>
    {lead ? <p className="mt-1.5 leading-normal text-text-2">{lead}</p> : null}
  </div>
)
