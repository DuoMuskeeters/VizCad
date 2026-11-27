/**
 * robots.txt (docs/12 §6.5), built in code; the static `public/robots.txt` is gone (a static asset would be served
 * before the Worker). Pure.
 *
 * - Production: everyone may crawl the marketing pages, the blog and blog images; app routes are disallowed. Blog
 *   images live under `/api/`, so `Allow: /api/blog/image/` is required: the longest matching rule wins, which lets it
 *   override `Disallow: /api/` for that prefix (OG images and post images stay crawlable).
 * - AI crawlers (K11): the same rules in their own groups, so marketing and blog are open to them and the app is not.
 *   A crawler with its own group ignores the `*` group, hence the repetition. The zone's "Block AI bots" and
 *   "Managed robots.txt" settings can still override this file (checked read-only, changed only with approval).
 * - Sign-in and sign-up pages stay crawlable: they send `noindex`, which a crawler can only see if it may fetch them.
 * - Staging and local development disallow everything (every response also carries `X-Robots-Tag: noindex`).
 */
import type { AppEnv } from '../services/AppConfig'

/** K11: AI crawlers that get the same access as search engines. */
export const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'] as const

/** App, admin, API and token routes, plus legacy app paths that now redirect into the app. */
export const DISALLOWED_PATHS = [
  '/app',
  '/admin',
  '/api/',
  '/s/',
  '/dev/',
  '/onboarding',
  '/invite/',
  '/guest-invite/',
  '/dashboard',
  '/file/',
  '/shared/',
] as const

export const ALLOWED_PATHS = ['/', '/api/blog/image/'] as const

const group = (agent: string) => [
  `User-agent: ${agent}`,
  ...ALLOWED_PATHS.map((path) => `Allow: ${path}`),
  ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
]

export const buildRobotsTxt = (input: { readonly appEnv: AppEnv; readonly siteUrl: URL }): string => {
  if (input.appEnv !== 'production') return ['# Not a public site: nothing here may be crawled or indexed.', 'User-agent: *', 'Disallow: /', ''].join('\n')
  return [
    ...group('*'),
    '',
    ...AI_CRAWLERS.flatMap((agent) => [...group(agent), '']),
    `Sitemap: ${input.siteUrl.origin}/sitemap.xml`,
    '',
  ].join('\n')
}
