import { createFileRoute } from '@tanstack/react-router'
import { MarketingShell } from '#/components/marketing/MarketingShell'
import { loadSite, siteHeaders } from '#/components/marketing/siteInfo'
import { buildHead, sameAlternates } from '#/shared/seo/head'
import { organization, website } from '#/shared/seo/jsonld'

const SITE_NAME = 'VizCad'
const TITLE = 'VizCad · CAD file viewer and sharing for teams'
const DESCRIPTION = 'Open, share and review 3D CAD files in the browser, with comments and access control for your team.'

// Placeholder. The landing page is built last, from approved screens (docs/12 §8.1, Faz 6f). Texts come from the CMS
// in 6d; until then the landing is live (indexable) in `en` only and other locales render the English fallback with
// canonical `en` and no hreflang (docs/12 §6.2). No og:image until the default OG images arrive with the settings (6d).
export const Route = createFileRoute('/{-$locale}/')({
  loader: () => loadSite(),
  staleTime: Infinity,
  headers: ({ loaderData }) => siteHeaders(loaderData),
  head: ({ loaderData: site, params }) => {
    if (site?.ok !== true) return { meta: [{ title: TITLE }, { name: 'description', content: DESCRIPTION }] }
    const siteUrl = new URL(site.siteOrigin)
    const locale = params.locale ?? 'en'
    const alternates = sameAlternates('/', [])
    // A closed locale renders the English fallback: its content language is `en`.
    const contentLocale = alternates[locale] === undefined ? 'en' : locale
    const head = buildHead({
      siteUrl,
      locale,
      alternates,
      title: TITLE,
      description: DESCRIPTION,
      siteName: SITE_NAME,
      jsonLd: [organization({ siteUrl, name: SITE_NAME, logo: `${siteUrl.origin}/vizcad-logo-512.png` }), website({ siteUrl, name: SITE_NAME, locale: contentLocale })],
    })
    return { meta: [...head.meta], links: [...head.links], scripts: [...head.scripts] }
  },
  component: Home,
})

function Home() {
  return (
    <MarketingShell>
      <div className="flex min-h-[50dvh] flex-col justify-center gap-3">
        <img src="/vizcad-logo-192.png" alt="" width={48} height={48} />
        <h1 className="font-heading text-2xl tracking-heading">VizCad</h1>
      </div>
    </MarketingShell>
  )
}
