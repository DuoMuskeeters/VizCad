import { useHead } from '@vueuse/head';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
}

export function SEO({
  title = 'VizCad - Professional 3D CAD Visualization Platform',
  description = 'Transform your CAD designs into stunning 3D visualizations with VizCad. Professional browser-based 3D modeling, rendering, and collaboration tools.',
  keywords = 'VizCad, vizcat, vizket, visicad, vizcom, 3D CAD, visualization, modeling, rendering, WebGL, browser 3D, CAD viewer, design visualization',
  ogImage = '/vizcad-logo-512.png',
}: SEOProps) {
  useHead({
    title,
    meta: [
      { name: 'description', content: description },
      { name: 'keywords', content: keywords },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
    ],
    link: [
      { rel: 'canonical', href: 'https://vizcad.com' },
      { rel: 'icon', type: 'image/x-icon', href: '/vizcad-logo.ico' },
      { rel: 'apple-touch-icon', sizes: '192x192', href: '/vizcad-logo-192.png' },
    ],
  });
  return null;
}
