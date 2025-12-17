import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileShares, user } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/files/shared-with-me")({
    server: {
        handlers: {
            // Get all files shared with current user
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

                    // Get files shared with this user
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
                            userName: user.name,
                            shareId: fileShares.id,
                            permission: fileShares.permission,
                            sharedAt: fileShares.createdAt,
                        })
                        .from(fileShares)
                        .innerJoin(files, eq(fileShares.fileId, files.id))
                        .leftJoin(user, eq(files.userId, user.id))
                        .where(and(
                            eq(fileShares.sharedWithUserId, session.user.id),
                            eq(fileShares.isActive, true),
                            eq(files.isDeleted, false)
                        ))
                        .orderBy(desc(fileShares.createdAt));

                    return new Response(JSON.stringify({ files: sharedFiles }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching shared files:", error);
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
