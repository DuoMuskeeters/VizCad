"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, useEffect, useCallback, useRef } from "react"
import { detectLanguage, seoContent } from "@/utils/language"
import {
  blogPosts,
  formatDate,
} from "@/data/blog-posts"
import { LandingFooter } from "@/components/landing"

export const Route = createFileRoute("/blog/")(
  {
    head: () => {
      const lang = detectLanguage()
      const content = (seoContent as any)[lang]?.blog || {
        title: "Blog | VizCad - Engineering & Digital Twin Insights",
        description:
          "Explore articles on digital twins, 3D printing, CAD collaboration, and engineering innovation. Stay ahead with VizCad's engineering blog.",
      }

      return {
        meta: [
          { title: content.title },
          { name: "description", content: content.description },
          {
            property: "og:title",
            content: content.ogTitle || content.title,
          },
          {
            property: "og:description",
            content: content.ogDescription || content.description,
          },
          { property: "og:url", content: "https://viz-cad.com/blog" },
          { property: "og:type", content: "website" },
          {
            name: "twitter:title",
            content: content.twitterTitle || content.title,
          },
          {
            name: "twitter:description",
            content: content.twitterDescription || content.description,
          },
        ],
        links: [{ rel: "canonical", href: "https://viz-cad.com/blog" }],
        scripts: [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Blog",
              name: "VizCad Blog",
              url: "https://viz-cad.com/blog",
              description:
                "Engineering insights on digital twins, 3D printing, CAD collaboration, and more.",
              publisher: {
                "@type": "Organization",
                name: "VizCad",
                url: "https://viz-cad.com",
              },
              blogPost: blogPosts.map((post) => ({
                "@type": "BlogPosting",
                headline: post.title,
                description: post.excerpt,
                datePublished: post.date,
                author: {
                  "@type": "Person",
                  name: post.author.name,
                },
                url: `https://viz-cad.com/blog/${post.slug}`,
              })),
            }),
          },
        ],
      }
    },
    component: BlogPage,
  }
)

/* ----------- Category Gradient Map ----------- */
const categoryGradients: Record<string, string> = {
  "Digital Twin": "from-cyan-500 to-blue-600",
  "3D Printing": "from-orange-500 to-red-600",
  CAD: "from-blue-500 to-indigo-600",
  Engineering: "from-emerald-500 to-teal-600",
  Software: "from-violet-500 to-purple-600",
}

/* ----------- Blog Cover Image ----------- */
function BlogCoverImage({
  post,
  className = "",
}: {
  post: { coverImage: string; category: string; title: string }
  className?: string
}) {
  const [imgError, setImgError] = useState(false)
  const gradient = categoryGradients[post.category] || "from-gray-600 to-gray-800"

  if (imgError) {
    return (
      <div
        className={`bg-gradient-to-br ${gradient} flex items-center justify-center ${className}`}
      >
        <span className="text-white/20 text-8xl font-black select-none">
          {post.category.charAt(0)}
        </span>
      </div>
    )
  }

  return (
    <img
      src={post.coverImage}
      alt={post.title}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  )
}

/* ----------- Date helper ----------- */
function getMonthDay(dateStr: string) {
  const d = new Date(dateStr)
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase()
  const day = d.getDate()
  return { month, day }
}

/* ----------- Hero Slider ----------- */
const SLIDE_INTERVAL = 5000
const heroSlides = blogPosts.slice(0, 5)

function HeroSlider() {
  const [current, setCurrent] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback((idx: number) => {
    setCurrent(idx)
  }, [])

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % heroSlides.length)
  }, [])

  const prev = useCallback(() => {
    setCurrent((p) => (p - 1 + heroSlides.length) % heroSlides.length)
  }, [])

  // Auto-slide
  useEffect(() => {
    if (isPaused) return
    timerRef.current = setInterval(next, SLIDE_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, next])

  return (
    <div
      className="relative w-full h-[300px] sm:h-[380px] md:h-[420px] lg:h-[480px] overflow-hidden rounded-none lg:rounded-2xl cursor-pointer"
      onMouseEnter={() => { setIsPaused(true); setIsHovered(true) }}
      onMouseLeave={() => { setIsPaused(false); setIsHovered(false) }}
    >
      {/* Slides */}
      {heroSlides.map((post, idx) => (
        <Link
          key={post.slug}
          to="/blog/$slug"
          params={{ slug: post.slug }}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out block"
          style={{ opacity: idx === current ? 1 : 0, zIndex: idx === current ? 10 : 0, pointerEvents: idx === current ? "auto" : "none" }}
        >
          {/* Background */}
          <BlogCoverImage post={post} className="w-full h-full" />

          {/* Hover overlay — fades in on hover */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ opacity: isHovered ? 1 : 0 }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          </div>

          {/* Content — only visible on hover */}
          <div
            className="absolute inset-0 z-20 flex flex-col justify-end p-5 sm:p-8 lg:p-10 transition-all duration-300"
            style={{ opacity: isHovered ? 1 : 0, transform: isHovered ? "translateY(0)" : "translateY(12px)" }}
          >
            {/* Date */}
            <p className="text-white/70 text-xs sm:text-sm font-medium mb-1.5 tracking-wide">
              {formatDate(post.date)}
            </p>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-tight mb-2 max-w-[70%] lg:max-w-[60%]">
              {post.title}
            </h2>

            {/* Excerpt */}
            <p className="text-white/60 text-sm leading-relaxed line-clamp-2 max-w-lg">
              {post.excerpt}
            </p>
          </div>
        </Link>
      ))}

      {/* Left arrow — hover only */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); prev() }}
        aria-label="Previous slide"
        className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-sm flex items-center justify-center transition-all duration-300"
        style={{ opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? "auto" : "none" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Right arrow — hover only */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); next() }}
        aria-label="Next slide"
        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-sm flex items-center justify-center transition-all duration-300"
        style={{ opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? "auto" : "none" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dot indicators — always visible, bottom right */}
      <div className="absolute bottom-4 right-4 sm:right-6 z-30 flex items-center gap-1.5">
        {heroSlides.map((_, idx) => (
          <button
            key={idx}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(idx) }}
            aria-label={`Go to slide ${idx + 1}`}
            className={`rounded-full transition-all duration-300 ${idx === current
              ? "w-3 h-3 bg-white"
              : "w-2 h-2 bg-white/50 hover:bg-white/80"
              }`}
          />
        ))}
      </div>
    </div>
  )
}

/* ----------- Newsletter Sidebar ----------- */
function NewsletterSidebar() {
  const [email, setEmail] = useState("")
  const [subscribed, setSubscribed] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail("")
    }
  }

  return (
    <aside className="hidden xl:block w-[300px] shrink-0">
      <div className="sticky top-28 space-y-6">
        {/* Newsletter */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h3 className="text-lg font-bold text-foreground mb-1">📬 Newsletter</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get the latest engineering insights delivered to your inbox.
          </p>
          {subscribed ? (
            <div className="text-sm text-primary font-medium bg-primary/10 rounded-lg p-3 text-center">
              ✓ Subscribed! Thank you.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Subscribe
              </button>
            </form>
          )}
        </div>

        {/* Categories */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h3 className="text-lg font-bold text-foreground mb-3">Categories</h3>
          <div className="space-y-2">
            {["Digital Twin", "3D Printing", "CAD", "Engineering", "Software"].map((cat) => {
              const count = blogPosts.filter(p => p.category === cat).length
              return (
                <div key={cat} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{cat}</span>
                  <span className="text-xs text-muted-foreground/60 bg-muted rounded-full px-2 py-0.5">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Popular Posts */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h3 className="text-lg font-bold text-foreground mb-3">Popular</h3>
          <div className="space-y-4">
            {blogPosts.slice(0, 3).map((post) => (
              <Link
                key={post.slug}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="block group/pop"
              >
                <p className="text-sm font-medium text-foreground group-hover/pop:text-primary transition-colors leading-snug line-clamp-2">
                  {post.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(post.date)}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ----------- Blog Page ----------- */
function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Slider */}
      <div className="pt-24 sm:pt-28 px-0 lg:px-8 max-w-7xl mx-auto">
        <HeroSlider />
      </div>

      {/* Content: Posts + Sidebar */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex gap-10">
          {/* Posts List */}
          <div className="flex-1 min-w-0 max-w-4xl">
            <div className="space-y-16 sm:space-y-20">
              {blogPosts.map((post) => {
                const { month, day } = getMonthDay(post.date)

                return (
                  <article key={post.slug} className="group">
                    <div className="flex gap-6 sm:gap-10">
                      {/* Date Column */}
                      <div className="hidden sm:flex flex-col items-center pt-1 min-w-[60px]">
                        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                          {month}
                        </span>
                        <span className="text-3xl font-bold text-foreground leading-none mt-1">
                          {day}
                        </span>
                      </div>

                      {/* Content Column */}
                      <div className="flex-1 min-w-0">
                        {/* Cover Image */}
                        <Link
                          to="/blog/$slug"
                          params={{ slug: post.slug }}
                          className="block relative overflow-hidden rounded-xl mb-6"
                        >
                          <div className="relative h-[280px] sm:h-[360px] lg:h-[420px] overflow-hidden rounded-xl">
                            <BlogCoverImage
                              post={post}
                              className="w-full h-full group-hover:scale-[1.03] transition-transform duration-700"
                            />
                          </div>
                        </Link>

                        {/* Title */}
                        <Link
                          to="/blog/$slug"
                          params={{ slug: post.slug }}
                          className="block"
                        >
                          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground group-hover:text-primary transition-colors duration-300 leading-tight mb-4">
                            {post.title}
                          </h2>
                        </Link>

                        {/* Excerpt */}
                        <p className="text-base text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                          {post.excerpt}{" "}
                          <Link
                            to="/blog/$slug"
                            params={{ slug: post.slug }}
                            className="inline-flex items-center gap-1 text-primary font-medium hover:underline whitespace-nowrap"
                          >
                            read more →
                          </Link>
                        </p>

                        {/* Meta Row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground uppercase tracking-wide">
                          <span className="sm:hidden">
                            {month} {day}, {new Date(post.date).getFullYear()}
                          </span>
                          <span className="sm:hidden text-border">·</span>
                          <span>{formatDate(post.date)}</span>
                          <span className="text-border">·</span>
                          <span>{post.author.name}</span>
                          <span className="text-border">·</span>
                          <span>{post.category}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {/* Empty state */}
            {blogPosts.length === 0 && (
              <div className="text-center py-24">
                <p className="text-lg text-muted-foreground">
                  No articles found yet.
                </p>
              </div>
            )}
          </div>

          {/* Newsletter Sidebar — desktop only */}
          <NewsletterSidebar />
        </div>
      </section>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}
