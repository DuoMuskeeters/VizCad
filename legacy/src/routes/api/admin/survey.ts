import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { surveyResponses } from "@/db/schema";
import { desc } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/survey")({
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

                    // Get all survey responses
                    const responses = await db
                        .select()
                        .from(surveyResponses)
                        .orderBy(desc(surveyResponses.createdAt));

                    return new Response(JSON.stringify({ responses }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error: any) {
                    console.error("Survey stats error:", error);
                    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                }
            },
        },
    },
});
