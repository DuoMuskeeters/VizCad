import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileShares } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getR2Client } from "@/lib/s3";

export const Route = createFileRoute("/api/shared/$token")({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                try {
                    const d1 = env?.vizcad_auth;

                    if (!d1) {
                        return new Response(JSON.stringify({ error: "Database binding not configured." }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const { token } = params;

                    if (!token) {
                        return new Response(JSON.stringify({ error: "Token is required." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const db = getDb(d1);

                    // Find share by token
                    const share = await db
                        .select({
                            id: fileShares.id,
                            fileId: fileShares.fileId,
                            isActive: fileShares.isActive,
                            expiresAt: fileShares.expiresAt,
                            password: fileShares.password,
                        })
                        .from(fileShares)
                        .where(and(
                            eq(fileShares.shareToken, token),
                            eq(fileShares.shareType, 'link')
                        ))
                        .limit(1);

                    if (!share.length) {
                        return new Response(JSON.stringify({ error: "Share not found." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const shareData = share[0];

                    // Check if share is active
                    if (!shareData.isActive) {
                        return new Response(JSON.stringify({ error: "This share link has been deactivated." }), {
                            status: 410,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    // Check expiration
                    if (shareData.expiresAt && new Date(shareData.expiresAt) < new Date()) {
                        return new Response(JSON.stringify({ error: "This share link has expired." }), {
                            status: 410,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    // Check password if required
                    if (shareData.password) {
                        const url = new URL(request.url);
                        const providedPassword = url.searchParams.get('password');

                        if (!providedPassword) {
                            return new Response(JSON.stringify({
                                error: "Password required.",
                                requiresPassword: true
                            }), {
                                status: 401,
                                headers: { "Content-Type": "application/json" }
                            });
                        }

                        if (providedPassword !== shareData.password) {
                            return new Response(JSON.stringify({ error: "Invalid password." }), {
                                status: 403,
                                headers: { "Content-Type": "application/json" }
                            });
                        }
                    }

                    // Get file info
                    const file = await db
                        .select({
                            id: files.id,
                            name: files.name,
                            r2Key: files.r2Key,
                            size: files.size,
                            mimeType: files.mimeType,
                            extension: files.extension,
                            thumbnailR2Key: files.thumbnailR2Key,
                            isDeleted: files.isDeleted,
                        })
                        .from(files)
                        .where(eq(files.id, shareData.fileId))
                        .limit(1);

                    if (!file.length || file[0].isDeleted) {
                        return new Response(JSON.stringify({ error: "File not found or has been deleted." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const fileData = file[0];

                    // Generate presigned URL for file download
                    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
                        return new Response(JSON.stringify({
                            error: "R2 Credentials missing."
                        }), {
                            status: 500,
                            headers: { "Content-Type": "application/json" }
                        });
                    }

                    const r2 = getR2Client(env);
                    const bucketName = env.R2_BUCKET_NAME || "vizcad-files-bucket";
                    const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

                    const downloadUrl = new URL(`${endpoint}/${bucketName}/${fileData.r2Key}`);
                    downloadUrl.searchParams.set("X-Amz-Expires", "3600");

                    const signedUrl = await r2.sign(downloadUrl, {
                        method: "GET",
                        aws: { signQuery: true }
                    });

                    const thumbnailSignedUrl = fileData.thumbnailR2Key ? await r2.sign(new URL(`${endpoint}/${bucketName}/${fileData.thumbnailR2Key}`), { method: "GET", aws: { signQuery: true } }) : null;

                    return new Response(JSON.stringify({
                        file: {
                            id: fileData.id,
                            name: fileData.name,
                            size: fileData.size,
                            mimeType: fileData.mimeType,
                            extension: fileData.extension,
                        },
                        downloadUrl: signedUrl.url,
                        thumbnailUrl: thumbnailSignedUrl?.url || null,
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });

                } catch (error) {
                    console.error("Error fetching shared file:", error);
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
