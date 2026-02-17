import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, user } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/storage-stats")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    if (!d1) {
                        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
                    }

                    const db = getDb(d1);
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    // Admin check
                    if (!session || !session.user || (session.user as any).role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
                    }

                    // Get storage stats per user
                    // We join users with files to get user details and aggregate file stats
                    const stats = await db
                        .select({
                            userId: user.id,
                            userName: user.name,
                            userEmail: user.email,
                            fileCount: sql<number>`count(${files.id})`,
                            totalSize: sql<number>`coalesce(sum(${files.size}), 0)`,
                        })
                        .from(user)
                        .leftJoin(files, and(eq(files.userId, user.id), eq(files.isDeleted, false)))
                        .groupBy(user.id)
                        .orderBy(desc(sql`sum(${files.size})`));

                    const filteredStats = stats.filter(s => s.fileCount > 0);

                    return new Response(JSON.stringify({ stats: filteredStats }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error: any) {
                    console.error("Storage stats error:", error);
                    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                }
            },
        },
    },
});
