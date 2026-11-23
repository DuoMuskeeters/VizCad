import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPostById } from "@/lib/blog.server";

export const Route = createFileRoute("/api/blog/$id")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const { id } = params;
                try {
                    const result = await getPostById(id);
                    return new Response(JSON.stringify(result), {
                        headers: { "Content-Type": "application/json" }
                    });
                } catch (e: any) {
                    return new Response(JSON.stringify({ error: e.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            },
            PUT: async ({ request, params }) => {
                const { id } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response(JSON.stringify({ error: "Database missing" }), { status: 500, headers: { "Content-Type": "application/json" } });
                const db = getDb(d1);

                // Auth check
                const auth = getAuth(d1, env, request.url);
                const session = await auth.api.getSession(request);
                if (!session || (session.user as any).role !== "admin") {
                    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
                }

                const data = await request.json() as any;

                // Handle publishedAt logic
                let updateData = {
                    ...data,
                    updatedAt: new Date(),
                };

                // If switching to published and no publishedAt exists, set it
                if (data.status === 'published') {
                    const existing = await db.select({ publishedAt: posts.publishedAt }).from(posts).where(eq(posts.id, id)).limit(1);
                    if (existing[0] && !existing[0].publishedAt) {
                        updateData.publishedAt = new Date();
                    }
                }

                await db.update(posts).set(updateData).where(eq(posts.id, id));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            },
            DELETE: async ({ request, params }) => {
                const { id } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response(JSON.stringify({ error: "Database missing" }), { status: 500, headers: { "Content-Type": "application/json" } });
                const db = getDb(d1);

                // Auth check
                const auth = getAuth(d1, env, request.url);
                const session = await auth.api.getSession(request);
                if (!session || (session.user as any).role !== "admin") {
                    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
                }

                await db.delete(posts).where(eq(posts.id, id));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
        }
    }
});

