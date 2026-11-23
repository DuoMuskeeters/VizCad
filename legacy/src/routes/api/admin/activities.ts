import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { activityLogs, user } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/activities")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    if (!d1) {
                        return new Response(
                            JSON.stringify({ error: "Cloudflare D1 binding not configured." }),
                            { status: 500, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    const db = getDb(d1);
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    // Check admin role
                    if (!session || (session.user as any).role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    const url = new URL(request.url);
                    const limit = Number(url.searchParams.get('limit')) || 50;
                    const offset = Number(url.searchParams.get('offset')) || 0;
                    const userId = url.searchParams.get('userId');

                    let query = db
                        .select({
                            id: activityLogs.id,
                            userId: activityLogs.userId,
                            userName: user.name,
                            userEmail: user.email,
                            action: activityLogs.action,
                            entityType: activityLogs.entityType,
                            entityId: activityLogs.entityId,
                            details: activityLogs.details,
                            ipAddress: activityLogs.ipAddress,
                            createdAt: activityLogs.createdAt,
                        })
                        .from(activityLogs)
                        .leftJoin(user, eq(activityLogs.userId, user.id))
                        .orderBy(desc(activityLogs.createdAt))
                        .limit(limit)
                        .offset(offset);

                    if (userId) {
                        query = query.where(eq(activityLogs.userId, userId)) as any;
                    }

                    const logs = await query;

                    return new Response(JSON.stringify({ logs }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching activity logs:", error);
                    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },
        },
    },
});
