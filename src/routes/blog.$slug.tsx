"use client"

import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useState, useRef } from "react"
import {
    getPostBySlug,
    getRelatedPosts,
    formatDate,
    blogPosts,
} from "@/data/blog-posts"
import { LandingFooter } from "@/components/landing"
import {
    ArrowLeft,
    Clock,
    Calendar,
    User,
    Tag,
    ArrowRight,
} from "lucide-react"

export const Route = createFileRoute("/blog/$slug")({
    head: ({ params }) => {
        const post = getPostBySlug(params.slug)
        if (!post) {
            return {
                meta: [{ title: "Article Not Found | VizCad Blog" }],
            }
        }
        return {
            meta: [
                { title: `${post.title} | VizCad Blog` },
                { name: "description", content: post.excerpt },
                { property: "og:title", content: post.title },
                { property: "og:description", content: post.excerpt },
                {
                    property: "og:url",
                    content: `https://viz-cad.com/blog/${post.slug}`,
                },
                { property: "og:type", content: "article" },
                { property: "og:image", content: `https://viz-cad.com${post.coverImage}` },
                { property: "article:published_time", content: post.date },
                { property: "article:author", content: post.author.name },
                { property: "article:section", content: post.category },
                ...post.tags.map((tag) => ({
                    property: "article:tag",
                    content: tag,
                })),
                { name: "twitter:card", content: "summary_large_image" },
                { name: "twitter:title", content: post.title },
                { name: "twitter:description", content: post.excerpt },
                { name: "twitter:image", content: `https://viz-cad.com${post.coverImage}` },
            ],
            links: [
                {
                    rel: "canonical",
                    href: `https://viz-cad.com/blog/${post.slug}`,
                },
            ],
            scripts: [
                {
                    type: "application/ld+json",
                    children: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "BlogPosting",
                        headline: post.title,
                        description: post.excerpt,
                        image: `https://viz-cad.com${post.coverImage}`,
                        datePublished: post.date,
                        author: {
                            "@type": "Person",
                            name: post.author.name,
                        },
                        publisher: {
                            "@type": "Organization",
                            name: "VizCad",
                            url: "https://viz-cad.com",
                        },
                        mainEntityOfPage: {
                            "@type": "WebPage",
                            "@id": `https://viz-cad.com/blog/${post.slug}`,
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

/* ----------- Markdown-like renderer ----------- */
function renderContent(content: string) {
    const lines = content.split("\n")
    const elements: React.ReactNode[] = []
    let inCodeBlock = false
    let codeLines: string[] = []
    let inTable = false
    let tableHeader: string[] = []
    let tableRows: string[][] = []
    let inList = false
    let listItems: React.ReactNode[] = []
    let listType: "ul" | "ol" = "ul"

    const flushList = () => {
        if (inList && listItems.length > 0) {
            if (listType === "ol") {
                elements.push(
                    <ol
                        key={`ol-${elements.length}`}
                        className="list-decimal list-inside space-y-2 my-6 pl-2 text-foreground/90"
                    >
                        {listItems}
                    </ol>
                )
            } else {
                elements.push(
                    <ul
                        key={`ul-${elements.length}`}
                        className="list-disc list-inside space-y-2 my-6 pl-2 text-foreground/90"
                    >
                        {listItems}
                    </ul>
                )
            }
            listItems = []
            inList = false
        }
    }

    const flushTable = () => {
        if (inTable && tableHeader.length > 0) {
            elements.push(
                <div key={`table-${elements.length}`} className="overflow-x-auto my-8">
                    <table className="min-w-full border border-border rounded-xl overflow-hidden">
                        <thead>
                            <tr className="bg-muted">
                                {tableHeader.map((h, i) => (
                                    <th
                                        key={i}
                                        className="px-4 py-3 text-left text-sm font-bold text-foreground border-b border-border"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map((row, ri) => (
                                <tr
                                    key={ri}
                                    className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}
                                >
                                    {row.map((cell, ci) => (
                                        <td
                                            key={ci}
                                            className="px-4 py-3 text-sm text-foreground/80 border-b border-border/50"
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
            tableHeader = []
            tableRows = []
            inTable = false
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                elements.push(
                    <pre
                        key={`code-${elements.length}`}
                        className="bg-slate-900 dark:bg-slate-800 text-slate-100 rounded-xl p-6 overflow-x-auto my-6 text-sm leading-relaxed font-mono border border-slate-700/50"
                    >
                        <code>{codeLines.join("\n")}</code>
                    </pre>
                )
                codeLines = []
                inCodeBlock = false
            } else {
                flushList()
                flushTable()
                inCodeBlock = true
            }
            continue
        }
        if (inCodeBlock) {
            codeLines.push(line)
            continue
        }

        // Tables
        if (line.includes("|") && line.trim().startsWith("|")) {
            flushList()
            const cells = line
                .split("|")
                .slice(1, -1)
                .map((c) => c.trim())

            if (!inTable) {
                tableHeader = cells
                inTable = true
                continue
            }

            // Check if separator row
            if (cells.every((c) => /^[-:]+$/.test(c))) {
                continue
            }

            tableRows.push(cells)
            continue
        } else if (inTable) {
            flushTable()
        }

        // Empty line
        if (line.trim() === "") {
            flushList()
            continue
        }

        // Headers
        if (line.startsWith("### ")) {
            flushList()
            elements.push(
                <h3
                    key={`h3-${elements.length}`}
                    className="text-xl font-bold text-foreground mt-10 mb-4"
                >
                    {line.replace("### ", "")}
                </h3>
            )
            continue
        }
        if (line.startsWith("## ")) {
            flushList()
            elements.push(
                <h2
                    key={`h2-${elements.length}`}
                    className="text-2xl sm:text-3xl font-bold text-foreground mt-12 mb-6 pb-3 border-b border-border/50"
                >
                    {line.replace("## ", "")}
                </h2>
            )
            continue
        }

        // Ordered list
        const olMatch = line.match(/^(\d+)\.\s\*\*(.+?)\*\*\s*—?\s*(.*)/)
        const olMatchSimple = line.match(/^(\d+)\.\s(.+)/)
        if (olMatch) {
            if (!inList || listType !== "ol") {
                flushList()
                inList = true
                listType = "ol"
            }
            listItems.push(
                <li key={`li-${elements.length}-${listItems.length}`} className="text-base leading-relaxed">
                    <strong className="font-semibold text-foreground">{olMatch[2]}</strong>
                    {olMatch[3] && <span> — {olMatch[3]}</span>}
                </li>
            )
            continue
        } else if (olMatchSimple && !line.startsWith("#")) {
            if (!inList || listType !== "ol") {
                flushList()
                inList = true
                listType = "ol"
            }
            listItems.push(
                <li key={`li-${elements.length}-${listItems.length}`} className="text-base leading-relaxed">
                    {renderInline(olMatchSimple[2])}
                </li>
            )
            continue
        }

        // Unordered list
        if (line.startsWith("- ")) {
            if (!inList || listType !== "ul") {
                flushList()
                inList = true
                listType = "ul"
            }
            const content = line.replace(/^- /, "")
            listItems.push(
                <li key={`li-${elements.length}-${listItems.length}`} className="text-base leading-relaxed">
                    {renderInline(content)}
                </li>
            )
            continue
        }

        // Paragraph
        flushList()
        elements.push(
            <p
                key={`p-${elements.length}`}
                className="text-base sm:text-lg leading-relaxed text-foreground/80 my-4"
            >
                {renderInline(line)}
            </p>
        )
    }

    flushList()
    flushTable()
    return elements
}

function renderInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = []
    const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index))
        }
        if (match[2]) {
            parts.push(
                <strong key={`b-${match.index}`} className="font-semibold text-foreground">
                    {match[2]}
                </strong>
            )
        } else if (match[3]) {
            parts.push(
                <code
                    key={`c-${match.index}`}
                    className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono text-foreground"
                >
                    {match[3]}
                </code>
            )
        } else if (match[4] && match[5]) {
            parts.push(
                <a
                    key={`a-${match.index}`}
                    href={match[5]}
                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                >
                    {match[4]}
                </a>
            )
        }
        lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>
}

/* ----------- Blog Cover Image ----------- */
function ArticleCoverImage({
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
function RelatedSlider({ relatedPosts }: { relatedPosts: ReturnType<typeof getRelatedPosts> }) {
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
    const { slug } = useParams({ from: "/blog/$slug" })
    const post = getPostBySlug(slug)

    if (!post) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-foreground mb-4">
                        Article Not Found
                    </h1>
                    <p className="text-muted-foreground mb-8">
                        The article you're looking for doesn't exist.
                    </p>
                    <Link
                        to="/blog"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Blog
                    </Link>
                </div>
            </div>
        )
    }

    const relatedPosts = getRelatedPosts(slug, 3)

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
                                {post.readTime} min read
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
                    {post.tags.map((tag) => (
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
                <div className="prose-vizcad">{renderContent(post.content)}</div>

                {/* About the Author */}
                <div className="mt-14 pt-8 border-t border-border">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">About the Author</h3>
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <User className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground mb-1">{post.author.name}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatDate(post.date)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {post.readTime} min read
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {post.author.bio || `${post.author.name} is a contributor at VizCad, sharing insights on ${post.category.toLowerCase()}, engineering innovation, and the future of digital manufacturing.`}
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
                            Related Articles
                        </h2>

                        {/* Desktop: grid */}
                        <div className="hidden md:grid md:grid-cols-3 gap-6">
                            {relatedPosts.map((rPost) => (
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

function RelatedCoverImage({ post }: { post: { coverImage: string; category: string; title: string } }) {
    const [imgError, setImgError] = useState(false)
    const gradient = categoryGradients[post.category] || "from-gray-600 to-gray-800"

    if (imgError) {
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
