import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'
import appCss from '../styles.css?url'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { Button } from '#/components/ui/Button'
import { EmptyState } from '#/components/ui/EmptyState'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      // Never disable zoom (CLAUDE.md, UI non-negotiables).
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      // Match --color-bg in design/tokens.css (light / dark).
      { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#0e141c', media: '(prefers-color-scheme: dark)' },
      { title: 'VizCad' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/vizcad-logo.ico' },
      { rel: 'icon', type: 'image/png', href: '/vizcad-logo-192.png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: '/vizcad-logo-192.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound,
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <I18nProvider>
      <UiProvider>
        <Outlet />
      </UiProvider>
    </I18nProvider>
  )
}

function RootNotFound() {
  return (
    <UiProvider>
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4 py-16">
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title="Bu sayfa yok"
          description="Aradığın sayfa kaldırılmış, adı değiştirilmiş ya da geçici olarak kullanılamıyor olabilir."
          actions={
            <Button variant="primary" asChild>
              <a href="/">Ana sayfaya dön</a>
            </Button>
          }
        />
      </main>
    </UiProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // i18n (5 locales) arrives with the first real screens; English is the default.
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
