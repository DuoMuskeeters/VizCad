"use client"

import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router"
import { useState, useEffect, useRef } from "react"
import { LandingFooter } from "@/components/landing"
import type { BlogPost, BlogPostWithAuthor } from "@/db/schema"
import MDEditor from "@uiw/react-md-editor"
import {
    ArrowLeft,
    Clock,
    Calendar,
    User,
    Tag,
    ArrowRight,
    Eye,
} from "lucide-react"

import { fetchPostBySlug, fetchIncrementView } from "@/lib/blog.functions"
import { detectLanguage, seoContent } from "@/utils/language"

// Define Loader Return Type
interface BlogArticleData {
    post: BlogPostWithAuthor
    relatedPosts: BlogPostWithAuthor[]
}

export const Route = createFileRoute("/blog/$slug")({
    loader: async ({ params }): Promise<BlogArticleData> => {
        // @ts-ignore
        return fetchPostBySlug({ data: { slug: params.slug } })
    },
    head: ({ loaderData }) => {
        const post = loaderData?.post
        const lang = detectLanguage()
        const content = seoContent.en.blog
        const ui = content.ui

        if (!post) {
            return {
                meta: [{ title: ui.articleNotFound }],
            }
        }

        // Construct absolute image URL for OG tags
        const baseUrl = "https://viz-cad.com"
        const coverImageUrl = post.coverImage
            ? (post.coverImage.startsWith("http") ? post.coverImage : `${baseUrl}${post.coverImage}`)
            : `${baseUrl}/heros.png`

        // Author details
        const authorName = post.author?.name || "VizCad Team";
        const authorUrl = post.author?.userId ? `${baseUrl}/author/${post.author.userId}` : baseUrl; // or just baseUrl if no author page

        return {
            meta: [
                { title: `${post.title} | VizCad Blog` },
                { name: "description", content: post.metaDescription || post.excerpt || "" },
                { name: "keywords", content: (post.tags || []).join(", ") },
                { name: "author", content: authorName },
                { property: "article:modified_time", content: new Date(post.updatedAt || post.createdAt).toISOString() },
                { property: "og:title", content: post.title },
                { property: "og:description", content: post.metaDescription || post.excerpt || "" },
                {
                    property: "og:url",
                    content: `${baseUrl}/blog/${post.slug}`,
                },
                { property: "og:type", content: "article" },
                { property: "og:image", content: coverImageUrl },
                { property: "og:image:width", content: "1200" },
                { property: "og:image:height", content: "630" },
                { property: "article:published_time", content: post.publishedAt ? new Date(post.publishedAt).toISOString() : "" },
                { property: "article:modified_time", content: new Date(post.updatedAt || post.createdAt).toISOString() },
                { property: "article:author", content: authorName },
                { property: "article:section", content: post.category },
                ...(post.tags || []).map((tag: string) => ({
                    property: "article:tag",
                    content: tag,
                })),
                { name: "twitter:card", content: "summary_large_image" },
                { name: "twitter:title", content: post.title },
                { name: "twitter:description", content: post.metaDescription || post.excerpt || "" },
                { name: "twitter:image", content: coverImageUrl },
                { name: "twitter:creator", content: "@VizCad0" }, // Could be dynamic if author has twitter handle
            ],
            links: [
                {
                    rel: "canonical",
                    href: `${baseUrl}/blog/${post.slug}`,
                },
            ],
            scripts: [
                {
                    type: "application/ld+json",
                    children: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "BreadcrumbList",
                        "itemListElement": [{
                            "@type": "ListItem",
                            "position": 1,
                            "name": "Home",
                            "item": baseUrl
                        }, {
                            "@type": "ListItem",
                            "position": 2,
                            "name": "Blog",
                            "item": `${baseUrl}/blog`
                        }, {
                            "@type": "ListItem",
                            "position": 3,
                            "name": post.category,
                            "item": `${baseUrl}/blog?category=${encodeURIComponent(post.category)}`
                        }, {
                            "@type": "ListItem",
                            "position": 4,
                            "name": post.title
                        }]
                    }),
                },
                {
                    type: "application/ld+json",
                    children: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "BlogPosting",
                        headline: post.title,
                        description: post.excerpt,
                        image: coverImageUrl,
                        datePublished: post.publishedAt,
                        dateModified: post.updatedAt,
                        keywords: (post.tags || []).join(", "),
                        author: {
                            "@type": "Person",
                            name: authorName,
                            image: post.author?.avatarUrl,
                            description: post.author?.bio,
                            jobTitle: post.author?.role,
                        },
                        publisher: {
                            "@type": "Organization",
                            name: "VizCad",
                            url: baseUrl,
                            logo: {
                                "@type": "ImageObject",
                                url: `${baseUrl}/vizcad-logo.png`
                            }
                        },
                        mainEntityOfPage: {
                            "@type": "WebPage",
                            "@id": `${baseUrl}/blog/${post.slug}`,
                        },
                    }),
                },
            ],
        }
    },
    component: BlogArticlePage,
})

/* ----------- Category Gradient Map ----------- */
const categoryGradients: Record<string, string> = {
    "Digital Twin": "from-cyan-500 to-blue-600",
    "3D Printing": "from-orange-500 to-red-600",
    CAD: "from-blue-500 to-indigo-600",
    Engineering: "from-emerald-500 to-teal-600",
    Software: "from-violet-500 to-purple-600",
}

const categoryColors: Record<string, string> = {
    "Digital Twin": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    "3D Printing": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    CAD: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Engineering: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Software: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
}

/* ----------- Date helper ----------- */
function formatDate(date: Date | string | null | undefined) {
    if (!date) return ""
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

/* ----------- Blog Cover Image ----------- */
function ArticleCoverImage({
    post,
    className = "",
}: {
    post: BlogPost
    className?: string
}) {
    const [imgError, setImgError] = useState(false)
    const gradient = categoryGradients[post.category] || "from-gray-600 to-gray-800"

    if (imgError || !post.coverImage) {
        return (
            <div
                className={`bg-gradient-to-br ${gradient} flex items-center justify-center ${className}`}
            >
                <div className="text-center text-white/60">
                    <span className="text-8xl font-black block mb-2 select-none">
                        {post.category.charAt(0)}
                    </span>
                    <span className="text-lg font-medium">{post.category}</span>
                </div>
            </div>
        )
    }

    return (
        <img
            src={post.coverImage}
            alt={post.title}
            className={`object-cover ${className}`}
            onError={() => setImgError(true)}
        />
    )
}

/* ----------- Related Posts Mobile Slider ----------- */
function RelatedSlider({ relatedPosts }: { relatedPosts: BlogPost[] }) {
    const [current, setCurrent] = useState(0)
    const touchStartX = useRef(0)
    const touchDeltaX = useRef(0)

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
        touchDeltaX.current = 0
    }
    const handleTouchMove = (e: React.TouchEvent) => {
        touchDeltaX.current = e.touches[0].clientX - touchStartX.current
    }
    const handleTouchEnd = () => {
        if (touchDeltaX.current > 50 && current > 0) {
            setCurrent(current - 1)
        } else if (touchDeltaX.current < -50 && current < relatedPosts.length - 1) {
            setCurrent(current + 1)
        }
    }

    const next = () => {
        if (current < relatedPosts.length - 1) setCurrent(current + 1)
    }

    const prev = () => {
        if (current > 0) setCurrent(current - 1)
    }

    return (
        <div className="md:hidden relative group">
            <div
                className="overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div
                    className="flex transition-transform duration-500 ease-out"
                    style={{ transform: `translateX(-${current * 100}%)` }}
                >
                    {relatedPosts.map((rPost, idx) => (
                        <div
                            key={rPost.slug}
                            className="w-full shrink-0 px-4"
                        >
                            <Link
                                to="/blog/$slug"
                                params={{ slug: rPost.slug }}
                                className="group block h-full"
                            >
                                <article className="h-full rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm">
                                    <div className="relative h-44 overflow-hidden">
                                        <RelatedCoverImage post={rPost} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                                    </div>
                                    <div className="p-5">
                                        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${categoryColors[rPost.category] || "bg-gray-100 text-gray-700"
                                                    }`}
                                            >
                                                {rPost.category}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {rPost.readTime} min
                                            </span>
                                        </div>
                                        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                                            {rPost.title}
                                        </h3>
                                    </div>
                                </article>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Arrows */}
            {current > 0 && (
                <button
                    onClick={prev}
                    className="absolute top-1/2 -translate-y-1/2 left-2 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-background transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
            )}
            {current < relatedPosts.length - 1 && (
                <button
                    onClick={next}
                    className="absolute top-1/2 -translate-y-1/2 right-2 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-background transition-colors"
                >
                    <ArrowRight className="w-5 h-5" />
                </button>
            )}

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-6">
                {relatedPosts.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrent(idx)}
                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${idx === current ? "bg-primary w-6" : "bg-muted-foreground/30"
                            }`}
                        aria-label={`Slide ${idx + 1}`}
                    />
                ))}
            </div>
        </div>
    )
}

/* ----------- Blog Article Page ----------- */
function BlogArticlePage() {
    const { post, relatedPosts } = useLoaderData({ from: "/blog/$slug" }) as BlogArticleData
    const [isMounted, setIsMounted] = useState(false)

    const lang = detectLanguage()
    const content = seoContent.en.blog
    const ui = content.ui

    useEffect(() => {
        setIsMounted(true)
        // Increment view count
        fetchIncrementView({ data: { slug: post.slug } }).catch(err => {
            console.error("Failed to increment view", err)
        })
    }, [post.slug])

    // Fallback for 404 handled in loader, but just in case
    if (!post) return null;

    const authorName = post.author?.name || "VizCad Team";
    const authorRole = post.author?.role || "Engineering Team";
    const authorBio = post.author?.bio || `Insights on ${post.category.toLowerCase()}, engineering innovation, and the future of digital manufacturing.`;
    const authorAvatar = post.author?.avatarUrl;

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Cover */}
            <div className="relative h-[40vh] sm:h-[50vh] lg:h-[60vh] overflow-hidden">
                <ArticleCoverImage
                    post={post}
                    className="w-full h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />

                {/* Title overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 lg:p-16">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center gap-3 mb-4">
                            <span
                                className={`px-3 py-1.5 rounded-full text-xs font-bold ${categoryColors[post.category] || "bg-white/20 text-white"
                                    } backdrop-blur-sm`}
                            >
                                {post.category}
                            </span>
                            <span className="flex items-center gap-1 text-white/80 text-sm">
                                <Clock className="w-3.5 h-3.5" />
                                {post.readTime} {ui.minRead}
                            </span>
                            <span className="flex items-center gap-1 text-white/80 text-sm">
                                <Eye className="w-3.5 h-3.5" />
                                {post.views || 0} views
                            </span>
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
                            {post.title}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Article Content */}
            <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2.5 text-lg font-semibold text-muted-foreground mb-8">
                    <Link to="/blog" className="hover:text-primary transition-colors flex items-center gap-2">
                        <ArrowLeft className="w-5 h-5" />
                        Blog
                    </Link>
                    <span className="text-border">›</span>
                    <span className="text-foreground/70">{post.category}</span>
                </nav>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {(post.tags || []).map((tag: string) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-sm text-primary-foreground font-medium"
                        >
                            <Tag className="w-3.5 h-3.5" />
                            {tag}
                        </span>
                    ))}
                </div>

                {/* Content */}
                <div data-color-mode="light" className="prose-vizcad leading-relaxed">
                    <MDEditor.Markdown
                        source={post.content}
                        style={{ backgroundColor: 'transparent', color: 'inherit' }}
                        wrapperElement={{
                            "data-color-mode": "light"
                        }}
                    />
                </div>

                {/* About the Author */}
                <div className="mt-14 pt-8 border-t border-border">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">{ui.aboutAuthor}</h3>
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                            {authorAvatar ? (
                                <img src={authorAvatar} alt={authorName} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-8 h-8 text-primary" />
                            )}
                        </div>
                        <div>
                            {/* Author Name */}
                            <p className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                                {authorName}
                                {authorRole && <span className="text-xs font-normal text-primary px-2.5 py-1 bg-primary/10 rounded-full">{authorRole}</span>}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatDate(post.publishedAt)}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {authorBio}
                            </p>
                        </div>
                    </div>
                </div>
            </article>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
                <section className="bg-muted/30 border-t border-border">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
                            {ui.related}
                        </h2>

                        {/* Desktop: grid */}
                        <div className="hidden md:grid md:grid-cols-3 gap-6">
                            {relatedPosts.map((rPost: BlogPost) => (
                                <Link
                                    key={rPost.slug}
                                    to="/blog/$slug"
                                    params={{ slug: rPost.slug }}
                                    className="group"
                                >
                                    <article className="h-full rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
                                        <div className="relative h-44 overflow-hidden">
                                            <RelatedCoverImage post={rPost} />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                                        </div>
                                        <div className="p-5">
                                            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${categoryColors[rPost.category] || "bg-gray-100 text-gray-700"
                                                        }`}
                                                >
                                                    {rPost.category}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {rPost.readTime} min
                                                </span>
                                            </div>
                                            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                                                {rPost.title}
                                            </h3>
                                        </div>
                                    </article>
                                </Link>
                            ))}
                        </div>

                        {/* Mobile: carousel slider */}
                        <RelatedSlider relatedPosts={relatedPosts} />
                    </div>
                </section>
            )}

            <LandingFooter />
        </div>
    )
}

function RelatedCoverImage({ post }: { post: BlogPost }) {
    const [imgError, setImgError] = useState(false)
    const gradient = categoryGradients[post.category] || "from-gray-600 to-gray-800"

    if (imgError || !post.coverImage) {
        return (
            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <span className="text-white/30 text-5xl font-black select-none">{post.category.charAt(0)}</span>
            </div>
        )
    }

    return (
        <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
            onError={() => setImgError(true)}
        />
    )
}
