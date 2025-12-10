import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import Header from "../components/Header"
import AppHeader from "../components/AppHeader"
import { ThemeProvider } from "../components/theme-provider"
import { PaletteProvider } from "../components/palette-provider"
import { SessionGuard } from "../components/SessionGuard"
import { detectLanguage, seoContent } from "@/utils/language"
import { useLocation } from "@tanstack/react-router"

// @ts-ignore
import appCss from '../styles.css?url'
import "@/i18n"


// Landing page dışında her sayfada AppHeader kullan, dashboard için hiçbir header gösterme
function AppAwareHeader() {
  const location = useLocation()
  const isLandingPage = location.pathname === "/"
  const isDashboard = location.pathname.startsWith("/dashboard")

  if (isDashboard) {
    return null
  }

  if (isLandingPage) {
    return <Header />
  }

  return <AppHeader />
}

export const Route = createRootRoute({
  ssr: true,
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].root

    return {
      meta: [
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
          content: content.locale,
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
        {
          rel: "canonical",
          href: "https://vizcad.com",
        },
        // Alternate language links for better SEO
        {
          rel: "alternate",
          hrefLang: "en",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hrefLang: "tr",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hrefLang: "de",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hrefLang: "es",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hrefLang: "fr",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hrefLang: "hi",
          href: "https://vizcad.com",
        },
      ],
      scripts: [
        {
          src: "https://www.googletagmanager.com/gtag/js?id=G-7DM9K53WE0",
          async: true,
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
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <PaletteProvider>
            <SessionGuard>
              <div className="min-h-screen bg-background text-foreground">
                <HeadContent />
                <AppAwareHeader />
                <main className="bg-background">
                  {children}
                </main>
                <TanStackRouterDevtools />
                <Scripts />
              </div>
            </SessionGuard>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
