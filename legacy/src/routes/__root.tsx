import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { LandingNavbar, AppNavbar } from "../components/navbar"
import { ThemeProvider } from "../components/theme-provider"
import { PaletteProvider } from "../components/palette-provider"
import { SessionGuard } from "../components/SessionGuard"
import { SurveyBubble } from "../components/SurveyBubble"
import { detectLanguage, seoContent } from "@/utils/language"
import { useLocation } from "@tanstack/react-router"
import { useEffect } from "react"

// @ts-ignore
import appCss from '../styles.css?url'
import "@/i18n"


// Sayfa tipine göre uygun navbar'ı göster
function AppAwareHeader() {
  const location = useLocation()
  const isLandingPage = location.pathname === "/"
  const isBlogPage = location.pathname.startsWith("/blog")
  const isPublicPage = ["/faq", "/contact", "/ModelSnap"].includes(location.pathname)
  const isAppOrDashboard = location.pathname === "/app" ||
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/file/")
  const isAuthPage = ["/login", "/signup", "/verify-email"].includes(location.pathname)

  // Auth sayfalarında navbar gösterme
  if (isAuthPage) {
    return null
  }

  // Landing, blog ve public sayfalar için LandingNavbar
  if (isLandingPage || isBlogPage || isPublicPage) {
    return <LandingNavbar />
  }

  // App, Dashboard ve diğer sayfalar için AppNavbar
  return <AppNavbar />
}

export const Route = createRootRoute({
  ssr: true,
  head: () => {
    // For hydration safety, we use 'en' as default for metadata.
    // If we're on a blog page, we strictly use English.
    const content = seoContent.en.root

    return {
      meta: [
        {
          title: content.title,
        },
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
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
          name: "author",
          content: "VizCad Team",
        },
        {
          name: "robots",
          content: "index, follow",
        },
        {
          name: "google-site-verification",
          content: "bzi8-Oqun8ymOf361vRE0sWI55uSWzTJrXHFgFJn3ug",
        },
        {
          property: "og:title",
          content: "VizCad: Free Online 3D CAD File Viewer & Converter (STL, OBJ, 3MF)",
        },
        {
          property: "og:description",
          content: "Upload and view STL, OBJ, PLY, 3MF files instantly with VizCad. Advanced in-browser 3D rendering for engineers, designers, and 3D printing hobbyists.",
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          property: "og:url",
          content: "https://viz-cad.com",
        },
        {
          property: "og:image",
          content: "https://viz-cad.com/heros.png",
        },
        {
          property: "og:site_name",
          content: "VizCad",
        },
        {
          property: "og:locale",
          content: "en_US",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:title",
          content: "VizCad: Free Online 3D CAD File Viewer & Converter",
        },
        {
          name: "twitter:description",
          content: "Upload and view STL, OBJ, PLY, 3MF files instantly with VizCad. Advanced in-browser 3D rendering for engineers, designers, and 3D printing hobbyists.",
        },
        {
          name: "twitter:image",
          content: "https://viz-cad.com/heros.png",
        },
        {
          name: "twitter:site",
          content: "@VizCad0",
        },
        {
          name: "twitter:creator",
          content: "@VizCad0",
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: appCss,
        },
        {
          rel: "icon",
          href: "/vizcad-logo.ico",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "/vizcad-logo-64.png",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "16x16",
          href: "/vizcad-logo.png",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "192x192",
          href: "/vizcad-logo-192.png",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "512x512",
          href: "/vizcad-logo-512.png",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/vizcad-logo-192.png",
        },
        {
          rel: "sitemap",
          type: "application/xml",
          href: "/sitemap.xml",
        },
      ],
      scripts: [
        {
          src: "https://www.googletagmanager.com/gtag/js?id=G-7DM9K53WE0",
          async: true,
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "VizCad",
            "url": "https://viz-cad.com",
            "logo": "https://viz-cad.com/vizcad-logo-512.png",
            "description": "Visualize and collaborate on 3D CAD models in your browser. VizCad supports STL, OBJ, and 3MF files with ease.",
            "sameAs": [
              "https://www.linkedin.com/company/vizcad"
            ],
            "contactPoint": {
              "@type": "ContactPoint",
              "contactType": "customer support",
              "url": "https://viz-cad.com/contact"
            }
          }),
        },
        {
          type: "text/javascript",
          children: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7DM9K53WE0');
          `,
        },
      ],
    }
  },
  shellComponent: RootComponent,
})

function RootComponent({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  useEffect(() => {
    // Restore language from localStorage after hydration.
    // However, if we are in the blog section, we might want to stay in English.
    // For now, let's restore it globally, but blog content itself is hardcoded to English.
    const savedLang = localStorage.getItem('vizcad-language')
    if (savedLang && ['tr', 'en', 'de', 'es', 'fr'].includes(savedLang)) {
      import('@/i18n').then((i18nModule) => {
        const i18n = i18nModule.default
        if (i18n.language !== savedLang) {
          i18n.changeLanguage(savedLang)
        }
      })
    }
  }, [])

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
          <PaletteProvider>
            <SessionGuard>
              <div className="min-h-screen bg-background text-foreground">
                <AppAwareHeader />
                <main className="bg-background">
                  {children}
                </main>
                <TanStackRouterDevtools />
                <SurveyBubble />
                <Scripts />
              </div>
            </SessionGuard>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
