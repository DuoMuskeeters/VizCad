import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/blog/slug/$slug")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const { env } = await import("cloudflare:workers");
                const { slug } = params;
                const d1 = env?.vizcad_auth;
                if (!d1) return new Response("Database missing", { status: 500 });
                const db = getDb(d1);

                const result = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
                return new Response(JSON.stringify(result[0] || null), {
                    headers: { "Content-Type": "application/json" }
                });
            }
        }
    }
});
