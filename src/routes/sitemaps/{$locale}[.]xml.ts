import { createFileRoute } from '@tanstack/react-router'
import { LOCALES, type Locale } from '#/i18n/locales'

const isLocale = (value: string): value is Locale => (LOCALES as ReadonlyArray<string>).includes(value)

/** One sitemap per locale (docs/12 §6.4). Unknown locales are 404 here; locales without a sitemap are 404 in the program. */
export const Route = createFileRoute('/sitemaps/{$locale}.xml')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isLocale(params.locale)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
        const locale = params.locale
        // Server-only modules are loaded here so they never reach the client bundle.
        const [{ env }, { handleSeoFile }] = await Promise.all([import('cloudflare:workers'), import('#/server/http/entry.cms')])
        return handleSeoFile(request, env, { kind: 'sitemap', locale })
      },
    },
  },
})
