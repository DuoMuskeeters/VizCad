import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileStars, user } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/files/starred")({
    server: {
        handlers: {
            // Get all starred files for current user
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

                    // Get starred files with file details
                    const starredFiles = await db
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
                            starredAt: fileStars.createdAt,
                        })
                        .from(fileStars)
                        .innerJoin(files, eq(fileStars.fileId, files.id))
                        .leftJoin(user, eq(files.userId, user.id))
                        .where(and(
                            eq(fileStars.userId, session.user.id),
                            eq(files.isDeleted, false),
                            eq(files.status, 'uploaded')
                        ))
                        .orderBy(desc(fileStars.createdAt));

                    return new Response(JSON.stringify({ files: starredFiles }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching starred files:", error);
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
