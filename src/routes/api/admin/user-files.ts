import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/user-files")({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            userId: search.userId as string,
        };
    },
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const url = new URL(request.url);
                    const userId = url.searchParams.get("userId");

                    if (!userId) {
                        return new Response(JSON.stringify({ error: "UserId required" }), { status: 400 });
                    }

                    const d1 = env?.vizcad_auth;
                    if (!d1) {
                        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
                    }

                    const db = getDb(d1);
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    // Admin check
                    if (!session || !session.user || session.user.role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
                    }

                    const userFiles = await db
                        .select()
                        .from(files)
                        .where(and(eq(files.userId, userId), eq(files.isDeleted, false)))
                        .orderBy(desc(files.createdAt));

                    return new Response(JSON.stringify({ files: userFiles }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error: any) {
                    console.error("User files error:", error);
                    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                }
            },
        },
    },
});
