import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileActivities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getR2Client } from "@/lib/s3";

export const Route = createFileRoute("/api/files/download")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;

                    if (!d1) {
                        return new Response(JSON.stringify({ error: "Database binding not configured." }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
                        return new Response(JSON.stringify({
                            error: "R2 Credentials missing in environment variables."
                        }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" }
                        });
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
                            headers: { "Content-Type": "application/json" }
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
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const fileData = file[0];

                    if (fileData.userId !== session.user.id) {
                        return new Response(JSON.stringify({ error: "Access denied." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    if (fileData.isDeleted) {
                        return new Response(JSON.stringify({ error: "File is in trash." }), {
                            status: 410,
                            headers: { "Content-Type": "application/json" }
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
                    }

                    // Generate Presigned URL
                    const r2 = getR2Client(env);
                    const bucketName = env.R2_BUCKET_NAME || "vizcad-files-bucket";
                    const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

                    const downloadUrl = new URL(`${endpoint}/${bucketName}/${fileData.r2Key}`);

                    // Set Content-Disposition
                    downloadUrl.searchParams.set("response-content-disposition", `attachment; filename="${encodeURIComponent(fileData.name)}"`);
                    // Set Content-Type
                    if (fileData.mimeType) {
                        downloadUrl.searchParams.set("response-content-type", fileData.mimeType);
                    }
                    downloadUrl.searchParams.set("X-Amz-Expires", "3600");

                    const signedUrl = await r2.sign(downloadUrl, {
                        method: "GET",
                        aws: { signQuery: true }
                    });

                    return Response.redirect(signedUrl.url, 302);

                } catch (error) {
                    console.error("Error generating download link:", error);
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
