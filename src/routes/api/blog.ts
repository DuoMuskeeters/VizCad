import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { getAllPosts } from "@/lib/blog.server";

export const Route = createFileRoute("/api/blog")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const status = url.searchParams.get("status") as 'draft' | 'published' | 'archived' | null;

                try {
                    const results = await getAllPosts(status || undefined);
                    return new Response(JSON.stringify(results), {
                        headers: { "Content-Type": "application/json" }
                    });
                } catch (e: any) {
                    console.error("Blog GET error:", e);
                    return new Response(JSON.stringify({ error: e.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            },
            POST: async ({ request }) => {
                const d1 = env?.vizcad_auth;
                if (!d1) {
                    return new Response(JSON.stringify({ error: "Database missing" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }
                const db = getDb(d1);

                try {
                    // Auth check
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);
                    if (!session || session.user.role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), {
                            status: 401,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const data = await request.json() as any;

                    // Ensure publishedAt is set if status is published
                    const publishedAt = (data.status === 'published' && !data.publishedAt)
                        ? new Date()
                        : (data.publishedAt ? new Date(data.publishedAt) : null);

                    await db.insert(posts).values({
                        ...data,
                        publishedAt,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        authorId: session.user.id
                    });

                    return new Response(JSON.stringify({ success: true, id: data.id }), {
                        headers: { "Content-Type": "application/json" }
                    });
                } catch (error: any) {
                    console.error("Failed to create post:", error);
                    return new Response(JSON.stringify({
                        error: "Internal Server Error",
                        details: error.message
                    }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }
        }
    }
});

