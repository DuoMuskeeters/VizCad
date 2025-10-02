import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import Header from "../components/Header"
import AppHeader from "../components/AppHeader"
import { ThemeProvider } from "../components/theme-provider"
import { PaletteProvider } from "../components/palette-provider"
import { detectLanguage, seoContent } from "@/utils/language"
import SeoUpdater from "@/components/SeoUpdater"
import { useLocation } from "@tanstack/react-router"

// App sayfasında AppHeader, diğer sayfalarda normal Header kullan
function AppAwareHeader() {
  const location = useLocation()
  const isAppPage = location.pathname === "/app"
  
  if (isAppPage) {
    return <AppHeader />
  }
  
  return <Header />
}

export const Route = createRootRoute({
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].root
    
    return {
      meta: [
        {
          charset: "utf-8",
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
          property: "og:type",
          content: "website",
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
          name: "twitter:site",
          content: "@VizCad0",
        },
        {
          name: "twitter:creator",
          content: "@VizCad0",
        },
        {
          name: "theme-color",
          content: "#2563eb",
        },
        {
          name: "msapplication-TileColor",
          content: "#2563eb",
        },
      ],
      links: [
        {
          rel: "icon",
          href: "/vizcad-logo.ico",
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
          rel: "manifest",
          href: "/manifest.json",
        },
        {
          rel: "canonical",
          href: "https://vizcad.com",
        },
        // Alternate language links for better SEO
        {
          rel: "alternate",
          hreflang: "en",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hreflang: "tr",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hreflang: "de",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hreflang: "es",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hreflang: "fr",
          href: "https://vizcad.com",
        },
        {
          rel: "alternate",
          hreflang: "hi",
          href: "https://vizcad.com",
        },
      ],
    }
  },
  component: () => (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <PaletteProvider>
        <div className="min-h-screen bg-background text-foreground">
          <HeadContent />
          <AppAwareHeader />
          <main className="bg-background">
            <Outlet />
          </main>
          <SeoUpdater />
          <TanStackRouterDevtools />
          <Scripts />
        </div>
      </PaletteProvider>
    </ThemeProvider>
  ),
})

