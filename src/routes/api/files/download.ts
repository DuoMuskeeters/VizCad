import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileActivities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

export const Route = createFileRoute("/api/files/download")({
    server: {
        handlers: {
            // Get file download URL or stream file directly
            GET: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    const R2Bucket = env?.R2_FILES_BUCKET;

                    if (!d1 || !R2Bucket) {
                        return new Response(
                            JSON.stringify({ error: "Cloudflare bindings (D1 or R2) not configured." }),
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

                    const url = new URL(request.url);
                    const fileId = url.searchParams.get('fileId');

                    if (!fileId) {
                        return new Response(JSON.stringify({ error: "fileId is required." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Get file info
                    const file = await db
                        .select({
                            id: files.id,
                            name: files.name,
                            r2Key: files.r2Key,
                            size: files.size,
                            mimeType: files.mimeType,
                            userId: files.userId,
                            isDeleted: files.isDeleted,
                        })
                        .from(files)
                        .where(eq(files.id, fileId))
                        .limit(1);

                    if (!file.length) {
                        return new Response(JSON.stringify({ error: "File not found." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    const fileData = file[0];

                    // Check ownership (TODO: also check shared access in the future)
                    if (fileData.userId !== session.user.id) {
                        return new Response(JSON.stringify({ error: "Access denied." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    if (fileData.isDeleted) {
                        return new Response(JSON.stringify({ error: "File is in trash." }), {
                            status: 410,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Get file from R2
                    const r2Object = await R2Bucket.get(fileData.r2Key);

                    if (!r2Object) {
                        return new Response(JSON.stringify({ error: "File not found in storage." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Log activity
                    try {
                        await db.insert(fileActivities).values({
                            id: ulid(),
                            fileId: fileId,
                            userId: session.user.id,
                            action: 'downloaded',
                            createdAt: new Date(),
                        });
                    } catch (activityError) {
                        console.error("Error logging download activity:", activityError);
                        // Non-critical, continue with download
                    }

                    // Return file as download
                    const headers = new Headers();
                    headers.set("Content-Type", fileData.mimeType || "application/octet-stream");
                    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileData.name)}"`);
                    headers.set("Content-Length", fileData.size.toString());

                    return new Response(r2Object.body, {
                        status: 200,
                        headers,
                    });
                } catch (error) {
                    console.error("Error downloading file:", error);
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
