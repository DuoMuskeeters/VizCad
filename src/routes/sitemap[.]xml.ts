import { createFileRoute } from "@tanstack/react-router";
import { getAllPosts } from "@/lib/blog.server";

export const Route = createFileRoute("/sitemap.xml")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const baseUrl = "https://viz-cad.com";
                const now = new Date().toISOString().split("T")[0];

                // Static routes
                const channels = [
                    { url: "/", freq: "weekly", priority: "1.0", lastmod: now },
                    { url: "/faq", freq: "monthly", priority: "0.8", lastmod: "2026-02-12" },
                    { url: "/contact", freq: "monthly", priority: "0.4", lastmod: "2026-02-12" },
                    { url: "/modelsnap", freq: "monthly", priority: "0.6", lastmod: "2026-02-12" },
                    { url: "/blog", freq: "weekly", priority: "0.9", lastmod: now },
                ];

                try {
                    // Dynamic routes (blog posts)
                    const posts = await getAllPosts("published");
                    const postEntries = posts.map((post) => ({
                        url: `/blog/${post.slug}`,
                        freq: "monthly",
                        priority: "0.7",
                        lastmod: post.updatedAt ? new Date(post.updatedAt).toISOString().split("T")[0] : post.publishedAt ? new Date(post.publishedAt).toISOString().split("T")[0] : now,
                    }));

                    const allEntries = [...channels, ...postEntries];

                    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries
                            .map(
                                (entry) => `  <url>
    <loc>${baseUrl}${entry.url}</loc>
    <lastmod>${entry.lastmod || now}</lastmod>
    <changefreq>${entry.freq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
                            )
                            .join("\n")}
</urlset>`;

                    return new Response(xml, {
                        headers: {
                            "Content-Type": "application/xml",
                            "Cache-Control": "public, max-age=3600, s-maxage=3600",
                        },
                    });
                } catch (error) {
                    console.error("Sitemap generation error:", error);
                    return new Response("Error generating sitemap", { status: 500 });
                }
            },
        },
    },
});
