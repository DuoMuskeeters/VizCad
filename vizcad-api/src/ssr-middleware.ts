import { Context } from 'hono'
import { readFileSync } from 'fs'
import { join } from 'path'

// Import the SSR entry point (will be available after build)
// This needs to be imported dynamically in production
interface SSRModule {
  renderToString: (context: { url: string; lang?: string }) => Promise<{
    html: string;
    head: { 
      title: string; 
      meta: any[]; 
      links: any[];
      metaTags: {
        title: string;
        description: string;
        keywords: string;
        canonical: string;
        ogTitle: string;
        ogDescription: string;
        ogImage: string;
        ogUrl: string;
        twitterTitle: string;
        twitterDescription: string;
        twitterImage: string;
      };
    };
    status: number;
  }>;
  shouldUseSSR: (pathname: string) => boolean;
  generateMetaTags: (pathname: string, lang?: string) => any;
}

// SSR template cache
let htmlTemplate: string | null = null;

function getHTMLTemplate(): string {
  if (!htmlTemplate) {
    try {
      // In production, this will be in the dist folder
      htmlTemplate = readFileSync(join(process.cwd(), 'src/index.template.html'), 'utf-8');
    } catch (error) {
      console.error('Failed to load HTML template:', error);
      // Fallback minimal template
      htmlTemplate = `
<!DOCTYPE html>
<html lang="{{LANG}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{TITLE}}</title>
    {{META_TAGS}}
  </head>
  <body>
    <div id="app" data-ssr>{{SSR_CONTENT}}</div>
    <script>window.__VIZCAD_SSR__ = true;</script>
    <script type="module" src="/src/entry.client.tsx"></script>
  </body>
</html>`;
    }
  }
  return htmlTemplate;
}

function detectLanguage(c: Context): 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi' {
  // 1. Check URL parameter
  const urlLang = c.req.query('lang');
  if (urlLang && ['en', 'tr', 'de', 'es', 'fr', 'hi'].includes(urlLang)) {
    return urlLang as 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi';
  }

  // 2. Check cookie
  const cookieLang = c.req.header('cookie')?.match(/vizcad-language=([^;]+)/)?.[1];
  if (cookieLang && ['en', 'tr', 'de', 'es', 'fr', 'hi'].includes(cookieLang)) {
    return cookieLang as 'en' | 'tr' | 'de' | 'es' | 'fr' | 'hi';
  }

  // 3. Check Accept-Language header
  const acceptLanguage = c.req.header('accept-language');
  if (acceptLanguage) {
    const browserLang = acceptLanguage.toLowerCase();
    if (browserLang.includes('tr')) return 'tr';
    if (browserLang.includes('de')) return 'de';
    if (browserLang.includes('es')) return 'es';
    if (browserLang.includes('fr')) return 'fr';
    if (browserLang.includes('hi')) return 'hi';
  }

  // 4. Default to English for international site
  return 'en';
}

function generateMetaTagsHTML(metaTags: {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
}): string {
  return `
    <title>${metaTags.title}</title>
    <meta name="description" content="${metaTags.description}" />
    <meta name="keywords" content="${metaTags.keywords}" />
    <link rel="canonical" href="${metaTags.canonical}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${metaTags.ogUrl}" />
    <meta property="og:title" content="${metaTags.ogTitle}" />
    <meta property="og:description" content="${metaTags.ogDescription}" />
    <meta property="og:image" content="${metaTags.ogImage}" />
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="${metaTags.ogUrl}" />
    <meta property="twitter:title" content="${metaTags.twitterTitle}" />
    <meta property="twitter:description" content="${metaTags.twitterDescription}" />
    <meta property="twitter:image" content="${metaTags.twitterImage}" />
  `;
}

export async function handleSSR(c: Context) {
  const pathname = new URL(c.req.url).pathname;
  const lang = detectLanguage(c);

  try {
    // Check if this route should use SSR
    const shouldUseSSR = ['/', '/contact', '/faq', '/store'].includes(pathname);
    
    if (!shouldUseSSR) {
      // Serve SPA shell for non-SSR routes
      return serveSPAShell(c, lang);
    }

    // Dynamic import of SSR module (in production this would be the built server bundle)
    let ssrModule: SSRModule;
    try {
      // In development, we'd need to handle this differently
      // For now, let's create a fallback implementation
      ssrModule = {
        renderToString: async (context) => ({
          html: '<div>Loading...</div>',
          head: { 
            title: 'VizCad - Profesyonel CAD Tasarım Hizmetleri',
            meta: [],
            links: [],
            metaTags: {
              title: 'VizCad - Professional 3D CAD File Viewer',
              description: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
              keywords: '3D viewer, CAD viewer, STL viewer',
              canonical: `https://vizcad.com${pathname}`,
              ogTitle: 'VizCad - Professional 3D CAD File Viewer',
              ogDescription: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
              ogImage: `https://vizcad.com/og-${pathname.slice(1) || 'home'}-${lang}.png`,
              ogUrl: `https://vizcad.com${pathname}`,
              twitterTitle: 'VizCad - CAD File Viewer',
              twitterDescription: 'Professional 3D CAD file viewer and renderer',
              twitterImage: `https://vizcad.com/twitter-${pathname.slice(1) || 'home'}-${lang}.png`
            }
          },
          status: 200
        }),
        shouldUseSSR: (pathname: string) => ['/', '/contact', '/faq', '/store'].includes(pathname),
        generateMetaTags: (pathname: string, lang = 'en') => ({
          title: 'VizCad - Professional 3D CAD File Viewer',
          description: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
          keywords: '3D viewer, CAD viewer, STL viewer',
          canonical: `https://vizcad.com${pathname}`,
          ogTitle: 'VizCad - Professional 3D CAD File Viewer',
          ogDescription: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
          ogImage: `https://vizcad.com/og-${pathname.slice(1) || 'home'}-${lang}.png`,
          ogUrl: `https://vizcad.com${pathname}`,
          twitterTitle: 'VizCad - CAD File Viewer',
          twitterDescription: 'Professional 3D CAD file viewer and renderer',
          twitterImage: `https://vizcad.com/twitter-${pathname.slice(1) || 'home'}-${lang}.png`
        })
      };
    } catch (error) {
      console.error('Failed to load SSR module:', error);
      return serveSPAShell(c, lang);
    }

    // Render the React app server-side
    const ssrResult = await ssrModule.renderToString({
      url: pathname,
      lang
    });

    // Use meta tags from SSR result
    const metaTagsHTML = generateMetaTagsHTML(ssrResult.head.metaTags);

    // Get HTML template and replace placeholders
    const template = getHTMLTemplate();
    const html = template
      .replace('{{LANG}}', lang)
      .replace('{{META_TAGS}}', metaTagsHTML)
      .replace('{{SSR_CONTENT}}', ssrResult.html)
      .replace('{{SSR_STYLES}}', '') // TODO: Add critical CSS
      .replace('{{TITLE}}', ssrResult.head.title);

    // Set appropriate headers
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    return c.html(html);

  } catch (error) {
    console.error('SSR Error:', error);
    
    // Fallback to SPA shell on error
    return serveSPAShell(c, lang);
  }
}

async function serveSPAShell(c: Context, lang: string) {
  // Serve the basic SPA shell for client-side rendering
  const template = getHTMLTemplate();
  const basicMetaTags = generateMetaTagsHTML({
    title: 'VizCad - Professional 3D CAD File Viewer',
    description: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
    keywords: '3D viewer, CAD viewer, STL viewer',
    canonical: 'https://vizcad.com',
    ogTitle: 'VizCad - Professional 3D CAD File Viewer',
    ogDescription: 'Professional 3D CAD file viewer and renderer with advanced visualization capabilities.',
    ogImage: 'https://vizcad.com/og-home-en.png',
    ogUrl: 'https://vizcad.com',
    twitterTitle: 'VizCad - CAD File Viewer',
    twitterDescription: 'Professional 3D CAD file viewer and renderer',
    twitterImage: 'https://vizcad.com/twitter-home-en.png'
  });

  const html = template
    .replace('{{LANG}}', lang)
    .replace('{{META_TAGS}}', basicMetaTags)
    .replace('{{SSR_CONTENT}}', '') // Empty for client rendering
    .replace('{{SSR_STYLES}}', '')
    .replace('{{TITLE}}', 'VizCad - Professional 3D CAD File Viewer');

  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=300'); // Cache SPA shell for 5 minutes
  
  return c.html(html);
}