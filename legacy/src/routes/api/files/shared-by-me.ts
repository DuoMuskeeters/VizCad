import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileShares, user, fileComments, fileInvitations } from "@/db/schema";
import { eq, and, desc, sql, or, exists } from "drizzle-orm";

export const Route = createFileRoute("/api/files/shared-by-me")({
    server: {
        handlers: {
            // Get all files shared BY the current user
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

                    // Get files where current user is the owner AND they have at least one active share
                    // We'll return distinct files
                    const sharedFiles = await db
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
                            commentCount: sql<number>`COALESCE((SELECT COUNT(*) FROM ${fileComments} WHERE ${fileComments.fileId} = ${files.id}), 0)`,
                            permission: sql<string>`'admin'`,
                        })
                        .from(files)
                        .leftJoin(user, eq(files.userId, user.id))
                        .where(and(
                            eq(files.userId, session.user.id),
                            eq(files.isDeleted, false),
                            or(
                                sql`EXISTS (SELECT 1 FROM ${fileShares} WHERE ${fileShares.fileId} = ${files.id} AND ${fileShares.isActive} = 1 AND ${fileShares.shareType} = 'user')`,
                                sql`EXISTS (SELECT 1 FROM ${fileInvitations} WHERE ${fileInvitations.fileId} = ${files.id})`
                            )
                        ))
                        .orderBy(desc(files.updatedAt));

                    return new Response(JSON.stringify({ files: sharedFiles }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching shared-by-me files:", error);
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
