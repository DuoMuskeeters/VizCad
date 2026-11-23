import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, activityLogs, user, fileComments } from "@/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

export const Route = createFileRoute("/api/files/recent")({
    server: {
        handlers: {
            // Get recently accessed files for current user
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

                    if (!session || !session.user) {
                        return new Response(JSON.stringify({ error: "Unauthorized." }), {
                            status: 401,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Subquery for comment counts
                    const commentCounts = db
                        .select({
                            fileId: fileComments.fileId,
                            count: count(fileComments.id).as('count'),
                        })
                        .from(fileComments)
                        .groupBy(fileComments.fileId)
                        .as('commentCounts');

                    // Get recent file activities with file details from activityLogs
                    const recentFiles = await db
                        .select({
                            id: files.id,
                            name: files.name,
                            r2Key: files.r2Key,
                            size: files.size,
                            mimeType: files.mimeType,
                            extension: files.extension,
                            status: files.status,
                            userId: files.userId,
                            createdAt: files.createdAt,
                            updatedAt: files.updatedAt,
                            thumbnailR2Key: files.thumbnailR2Key,
                            userName: user.name,
                            userImage: user.image,
                            lastActivity: activityLogs.createdAt,
                            lastAction: activityLogs.action,
                            commentCount: sql<number>`COALESCE(${commentCounts.count}, 0)`,
                            permission: sql<string>`'admin'`,
                        })
                        .from(activityLogs)
                        .innerJoin(files, eq(activityLogs.entityId, files.id))
                        .leftJoin(user, eq(files.userId, user.id))
                        .leftJoin(commentCounts, eq(files.id, commentCounts.fileId))
                        .where(and(
                            eq(activityLogs.userId, session.user.id),
                            eq(files.isDeleted, false),
                            eq(files.status, 'uploaded'),
                            eq(activityLogs.action, 'file_view')
                        ))
                        .orderBy(desc(activityLogs.createdAt))
                        .limit(50);

                    // Remove duplicates (keep first occurrence which is the most recent)
                    const uniqueFiles = recentFiles.reduce((acc, file) => {
                        if (!acc.find(f => f.id === file.id)) {
                            acc.push(file);
                        }
                        return acc;
                    }, [] as typeof recentFiles);

                    return new Response(JSON.stringify({ files: uniqueFiles }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching recent files:", error);
                    const message = error instanceof Error ? error.message : "Unknown error";
                    return new Response(JSON.stringify({ error: message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },
        },
    },
});
