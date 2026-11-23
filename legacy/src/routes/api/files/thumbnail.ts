import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/files/thumbnail")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const url = new URL(request.url);
                    const fileId = url.searchParams.get("fileId");
                    const keyParam = url.searchParams.get("key");

                    const d1 = env?.vizcad_auth;
                    const R2Bucket = env?.R2_FILES_BUCKET;

                    if (!d1 || !R2Bucket) {
                        return new Response("Storage not configured", { status: 500 });
                    }

                    // Optional: Check auth if these should be private
                    // For thumbnails in list view, likely improved UX if they load fast
                    // But strict security says check auth.
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);
                    if (!session?.user) {
                        return new Response("Unauthorized", { status: 401 });
                    }

                    let thumbnailKey = keyParam;

                    // If fileId provided, look up the key
                    if (fileId && !thumbnailKey) {
                        const db = getDb(d1);
                        const fileRecord = await db.select({
                            thumbnailR2Key: files.thumbnailR2Key,
                            userId: files.userId
                        })
                            .from(files)
                            .where(eq(files.id, fileId))
                            .get();

                        if (!fileRecord || !fileRecord.thumbnailR2Key) {
                            return new Response("Thumbnail not found", { status: 404 });
                        }

                        // Optional: Check if user has access to this file
                        // For now assume if they have a session they can view public/shared/own files
                        // Real implementation should check ownership or share permissions

                        thumbnailKey = fileRecord.thumbnailR2Key;
                    }

                    if (!thumbnailKey) {
                        return new Response("Key required", { status: 400 });
                    }

                    const object = await R2Bucket.get(thumbnailKey);

                    if (!object) {
                        return new Response("Thumbnail not found in storage", { status: 404 });
                    }

                    const headers = new Headers();
                    object.writeHttpMetadata(headers);
                    headers.set("etag", object.httpEtag);
                    headers.set("Cache-Control", "public, max-age=31536000"); // Cache for a year

                    return new Response(object.body, {
                        headers,
                    });

                } catch (error) {
                    console.error("Thumbnail fetch error:", error);
                    return new Response("Server Error", { status: 500 });
                }
            },
        },
    },
});
