import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      // Never disable zoom (CLAUDE.md, UI non-negotiables).
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#ffffff' },
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
  component: Outlet,
  shellComponent: RootDocument,
})

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
