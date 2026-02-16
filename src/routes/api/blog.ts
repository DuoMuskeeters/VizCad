import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db/client";
import { files, posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/blog")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const { env } = await import("cloudflare:workers");
                const url = new URL(request.url);
                const status = url.searchParams.get("status") as 'draft' | 'published' | 'archived' | null;

                const d1 = env?.vizcad_auth;
                if (!d1) return new Response("Database missing", { status: 500 });
                const db = getDb(d1);

                const whereClause = status ? eq(posts.status, status) : undefined;
                const results = await db.select().from(posts).where(whereClause).orderBy(desc(posts.publishedAt));
                return new Response(JSON.stringify(results), {
                    headers: { "Content-Type": "application/json" }
                });
            },
            POST: async ({ request }) => {
                const { env } = await import("cloudflare:workers");
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response(JSON.stringify({ error: "Database missing" }), { status: 500, headers: { "Content-Type": "application/json" } });
                const db = getDb(d1);

                try {
                    // Auth check
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);
                    if (!session || session.user.role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
                    }

                    const data = await request.json() as any; // Typed in client

                    // Validate Date fields
                    const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;

                    await db.insert(posts).values({
                        ...data,
                        publishedAt, // Overwrite with parsed date
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
