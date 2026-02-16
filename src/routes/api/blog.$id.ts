import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/blog/$id")({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const { env } = await import("cloudflare:workers");
                const { id } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response("Database missing", { status: 500 });
                const db = getDb(d1);

                const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
                return new Response(JSON.stringify(result[0] || null), {
                    headers: { "Content-Type": "application/json" }
                });
            },
            PUT: async ({ request, params }) => {
                const { env } = await import("cloudflare:workers");
                const { id } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response("Database missing", { status: 500 });
                const db = getDb(d1);

                // Auth check
                const auth = getAuth(d1, env, request.url);
                const session = await auth.api.getSession(request);
                if (!session || session.user.role !== "admin") {
                    return new Response("Unauthorized", { status: 401 });
                }

                const data = await request.json() as any;

                await db.update(posts).set({
                    ...data,
                    updatedAt: new Date(),
                }).where(eq(posts.id, id));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            },
            DELETE: async ({ request, params }) => {
                const { env } = await import("cloudflare:workers");
                const { id } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response("Database missing", { status: 500 });
                const db = getDb(d1);

                // Auth check
                const auth = getAuth(d1, env, request.url);
                const session = await auth.api.getSession(request);
                if (!session || session.user.role !== "admin") {
                    return new Response("Unauthorized", { status: 401 });
                }

                await db.delete(posts).where(eq(posts.id, id));

                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
        }
    }
});
