"use client"

import { useEffect } from "react"

interface SEOProps {
  title?: string
  description?: string
  keywords?: string
  ogImage?: string
}

export function SEO({
  title = "VizCad - Professional 3D CAD Visualization Platform",
  description = "Transform your CAD designs into stunning 3D visualizations with VizCad. Professional browser-based 3D modeling, rendering, and collaboration tools.",
  keywords = "VizCad, vizcat, vizket, visicad, vizcom, 3D CAD, visualization, modeling, rendering, WebGL, browser 3D, CAD viewer, design visualization",
  ogImage = "/assets/vizcad-logo-512.png",
}: SEOProps) {
  useEffect(() => {
    document.title = title

    // Update meta tags
    const updateMetaTag = (name: string, content: string, property?: boolean) => {
      const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`
      let meta = document.querySelector(selector) as HTMLMetaElement
      if (!meta) {
        meta = document.createElement("meta")
        if (property) {
          meta.setAttribute("property", name)
        } else {
          meta.setAttribute("name", name)
        }
        document.head.appendChild(meta)
      }
      meta.setAttribute("content", content)
    }

    // Update link tags
    const updateLinkTag = (rel: string, href: string, type?: string, sizes?: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement
      if (!link) {
        link = document.createElement("link")
        link.setAttribute("rel", rel)
        document.head.appendChild(link)
      }
      link.setAttribute("href", href)
      if (type) link.setAttribute("type", type)
      if (sizes) link.setAttribute("sizes", sizes)
    }

    // Set meta tags
    updateMetaTag("description", description)
    updateMetaTag("keywords", keywords)
    updateMetaTag("og:title", title, true)
    updateMetaTag("og:description", description, true)
    updateMetaTag("og:image", ogImage, true)
    updateMetaTag("twitter:title", title)
    updateMetaTag("twitter:description", description)
    updateMetaTag("twitter:image", ogImage)

    // Set link tags
    updateLinkTag("canonical", "https://viz-cad.com")
  updateLinkTag("icon", "/assets/vizcad-logo.ico", "image/x-icon")
  updateLinkTag("apple-touch-icon", "/assets/vizcad-logo-192.png", undefined, "192x192")
  }, [title, description, keywords, ogImage])

  return null
}