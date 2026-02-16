import { detectLanguage, seoContent } from "@/utils/language"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useEffect } from "react"
import {
  Hero,
  Features,
  FeatureShowcase,
  Pricing,
  Cta,
  LandingFooter,
} from "@/components/landing"

// index.tsx (Homepage)
export const Route = createFileRoute("/")({
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].home

    return {
      meta: [
        {
          title: content.title,
        },
        {
          name: "description",
          content: content.description,
        },
        {
          name: "keywords",
          content: content.keywords,
        },
        {
          property: "og:title",
          content: content.ogTitle,
        },
        {
          property: "og:description",
          content: content.ogDescription,
        },
        {
          property: "og:url",
          content: "https://viz-cad.com",
        },
        {
          property: "og:image",
          content: `https://viz-cad.com/og-home-${lang}.png`,
        },
        {
          property: "og:image:width",
          content: "1200",
        },
        {
          property: "og:image:height",
          content: "630",
        },
        {
          name: "twitter:title",
          content: content.twitterTitle,
        },
        {
          name: "twitter:description",
          content: content.twitterDescription,
        },
        {
          name: "twitter:image",
          content: `https://viz-cad.com/twitter-home-${lang}.png`,
        },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://viz-cad.com",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "VizCad",
            "operatingSystem": "Web Browser",
            "applicationCategory": "DesignApplication",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            },
            "description": "Fast and free online 3D CAD file viewer and sharing platform. Supports STEP, STL, and OBJ formats in your browser.",
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "VizCad",
            "url": "https://viz-cad.com",
          }),
        },
      ],
    }
  },
  component: HomePage,
})

export function HomePage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* HERO SECTION */}
      <Hero />

      {/* FEATURE SHOWCASE SECTION */}
      <FeatureShowcase />

      {/* PRICING SECTION */}
      {/*<Pricing />

      {/* FEATURES SECTION */}
      <Features />

      {/* CTA SECTION */}
      <Cta />

      {/* FOOTER */}
      <LandingFooter />
    </div>
  )
}
