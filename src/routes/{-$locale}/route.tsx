import { Outlet, createFileRoute } from '@tanstack/react-router'
import { parseLocaleParam } from '#/shared/marketingRoutes'

/**
 * The locale prefix of marketing pages (K1, docs/12 §1.2): `/` and `/pricing` are `en`, `/tr` and `/tr/pricing` are
 * Turkish. `params.parse` accepts only `tr|de|es|fr`; any other first segment makes the router skip this route, so
 * static routes (`/app`, `/s/...`, `/sign-in`, `/api/*`) and legacy URLs are never shadowed (src/routes.test.ts).
 * `/en/...` never reaches the router: the Worker answers it with a 301 (server/edge/localeRedirect.ts).
 * Marketing pages are SSR + edge cached and their links are full page loads; each page loads its own data
 * (components/marketing/siteInfo.ts for the head).
 */
export const Route = createFileRoute('/{-$locale}')({
  params: {
    parse: (raw) => parseLocaleParam(raw.locale),
    stringify: (params) => ({ locale: params.locale }),
  },
  component: Outlet,
})
