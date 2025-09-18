import { StrictMode } from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { detectLanguage, seoContent } from './utils/language'
import './i18n'

// Import CSS for SSR (will be injected into HTML)
import './styles.css'

interface SSRContext {
  url: string
  lang?: string
}

export async function renderToString({ url, lang }: SSRContext) {
  try {
    // Detect language if not provided - server-side safe
    const detectedLang = lang || 'en' // Default to English for international site
    
    // Create memory history for SSR
    const memoryHistory = createMemoryHistory({
      initialEntries: [url]
    })

    // Create router instance for SSR
    const router = createRouter({
      routeTree,
      history: memoryHistory,
      context: {
        // Pass server-side context if needed
        isSSR: true,
        lang: detectedLang
      } as any,
      defaultPreload: false, // Disable preloading on server
      defaultStructuralSharing: false, // Disable for server
    })

    // Wait for router to load the route
    await router.load()

    // Generate the HTML
    const html = ReactDOMServer.renderToString(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )

    // Extract head content for meta tags
    const headContent = extractHeadContent(router)
    
    // Generate SEO meta tags using existing seoContent system
    const pathname = new URL(`https://vizcad.com${url}`).pathname
    let routeKey: 'home' | 'app' | 'contact' | 'faq' = 'home'
    
    // Map pathname to routeKey
    if (pathname === '/') routeKey = 'home'
    else if (pathname === '/app') routeKey = 'app'
    else if (pathname === '/contact') routeKey = 'contact'
    else if (pathname === '/faq') routeKey = 'faq'
    
    // Type-safe access to seoContent
    const langKey = (['tr', 'en', 'de', 'es', 'fr', 'hi'].includes(detectedLang) ? detectedLang : 'en') as keyof typeof seoContent
    const langContent = seoContent[langKey]
    const seoData = langContent[routeKey] || langContent.home
    
    const metaTags = {
      title: seoData?.title || 'VizCad - Professional 3D CAD File Viewer',
      description: seoData?.description || 'Professional 3D CAD file viewer and renderer',
      keywords: seoData?.keywords || '3D viewer, CAD viewer, STL viewer',
      canonical: `https://vizcad.com${pathname}`,
      ogTitle: seoData?.ogTitle || seoData?.title || 'VizCad',
      ogDescription: seoData?.ogDescription || seoData?.description || 'Professional 3D CAD file viewer and renderer',
      ogImage: `https://vizcad.com/og-${routeKey}-${detectedLang}.png`,
      ogUrl: `https://vizcad.com${pathname}`,
      twitterTitle: seoData?.twitterTitle || seoData?.ogTitle || seoData?.title || 'VizCad',
      twitterDescription: seoData?.twitterDescription || seoData?.ogDescription || seoData?.description || 'Professional 3D CAD file viewer and renderer',
      twitterImage: `https://vizcad.com/twitter-${routeKey}-${detectedLang}.png`
    }
    
    return {
      html,
      head: {
        ...headContent,
        metaTags
      },
      status: 200
    }

  } catch (error) {
    console.error('SSR Error:', error)
    
    // Return error page HTML
    const errorHtml = ReactDOMServer.renderToString(
      <StrictMode>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>500 - Server Error</h1>
          <p>Something went wrong during server-side rendering.</p>
        </div>
      </StrictMode>
    )

    return {
      html: errorHtml,
      head: {
        title: 'Server Error - VizCad',
        meta: [],
        links: [],
        metaTags: {
          title: 'Server Error - VizCad',
          description: 'Server error occurred',
          keywords: 'server error',
          canonical: 'https://vizcad.com',
          ogTitle: 'Server Error - VizCad',
          ogDescription: 'Server error occurred',
          ogImage: 'https://vizcad.com/og-error-en.png',
          ogUrl: 'https://vizcad.com',
          twitterTitle: 'Server Error - VizCad',
          twitterDescription: 'Server error occurred',
          twitterImage: 'https://vizcad.com/twitter-error-en.png'
        }
      },
      status: 500
    }
  }
}

function extractHeadContent(router: any) {
  // Extract head content from TanStack Router
  // This will include title, meta tags, and links from route definitions
  const matches = router.state.matches || []
  
  let title = 'VizCad - Profesyonel CAD Tasarım Hizmetleri'
  const meta: Array<{ name?: string, property?: string, content: string, charset?: string }> = []
  const links: Array<{ rel: string, href: string }> = []

  // Combine head content from all matched routes
  matches.forEach((match: any) => {
    if (match.route?.options?.head) {
      const headResult = match.route.options.head()
      
      if (headResult?.title) {
        title = headResult.title
      }
      
      if (headResult?.meta) {
        meta.push(...headResult.meta)
      }
      
      if (headResult?.links) {
        links.push(...headResult.links)
      }
    }
  })

  return { title, meta, links }
}

// Utility function to check if route should be SSR'd
export function shouldUseSSR(pathname: string): boolean {
  const ssrRoutes = [
    '/',           // Homepage
    '/contact',    // Contact page  
    '/faq',        // FAQ page
    '/store',      // Store/marketplace
  ]
  
  // Exact match for SSR routes
  return ssrRoutes.includes(pathname)
}

// Export generateMetaTags helper function for backward compatibility
export function generateMetaTags(pathname: string, lang: string = 'en') {
  const langKey = (['tr', 'en', 'de', 'es', 'fr', 'hi'].includes(lang) ? lang : 'en') as keyof typeof seoContent
  let routeKey: 'home' | 'app' | 'contact' | 'faq' = 'home'
  
  if (pathname === '/') routeKey = 'home'
  else if (pathname === '/app') routeKey = 'app'
  else if (pathname === '/contact') routeKey = 'contact'
  else if (pathname === '/faq') routeKey = 'faq'
  
  const langContent = seoContent[langKey]
  const seoData = langContent[routeKey] || langContent.home
  
  return {
    title: seoData.title,
    description: seoData.description,
    keywords: seoData.keywords,
    canonical: `https://vizcad.com${pathname}`,
    ogTitle: seoData.ogTitle || seoData.title,
    ogDescription: seoData.ogDescription || seoData.description,
    ogImage: `https://vizcad.com/og-${routeKey}-${lang}.png`,
    ogUrl: `https://vizcad.com${pathname}`,
    twitterTitle: seoData.twitterTitle || seoData.ogTitle || seoData.title,
    twitterDescription: seoData.twitterDescription || seoData.ogDescription || seoData.description,
    twitterImage: `https://vizcad.com/twitter-${routeKey}-${lang}.png`
  }
}