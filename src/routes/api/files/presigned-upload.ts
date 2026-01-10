import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { ulid } from "ulid";
import { getR2Client } from "@/lib/s3";

export const Route = createFileRoute("/api/files/presigned-upload")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;

                    if (!d1) {
                        return new Response(JSON.stringify({ error: "Database binding (D1) not found." }), { status: 500 });
                    }

                    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
                        return new Response(JSON.stringify({
                            error: "R2 Credentials missing in environment variables. Please check Cloudflare Dashboard > Settings > Variables."
                        }), { status: 500 });
                    }

                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    if (!session || !session.user) {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), {
                            status: 401,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    const body = (await request.json()) as {
                        name: string;
                        type: string;
                        size: number;
                        withThumbnail?: boolean;
                    };


                    if (!body.name || !body.type) {
                        return new Response(
                            JSON.stringify({ error: "Missing file information" }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    // STEP file size limit check (5MB)
                    const extension = body.name.split('.').pop()?.toLowerCase();
                    const isStepFormat = ['step', 'stp', 'iges', 'igs', 'brep'].includes(extension || '');
                    const MAX_STEP_SIZE = 5 * 1024 * 1024; // 5MB

                    if (isStepFormat && body.size > MAX_STEP_SIZE) {
                        return new Response(
                            JSON.stringify({
                                error: "STEP/IGES dosyaları için boyut sınırı 5MB'dır. Daha büyük dosyalar desteklenmemektedir."
                            }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    const r2 = getR2Client(env);
                    const fileId = ulid();
                    const bucketName = env.R2_BUCKET_NAME || "vizcad-files-bucket";
                    // Ensure endpoint has protocol
                    const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

                    // 1. Generate Main File Presigned URL
                    const fileKey = `${session.user.id}/${fileId}/${body.name}`;
                    const fileUrl = new URL(`${endpoint}/${bucketName}/${fileKey}`);

                    // Set expiration
                    fileUrl.searchParams.set("X-Amz-Expires", "3600");

                    const signedFile = await r2.sign(fileUrl, {
                        method: "PUT",
                        aws: { signQuery: true },
                    });

                    // 2. Generate Thumbnail Presigned URL (if requested)
                    let thumbnailData = null;
                    if (body.withThumbnail) {
                        const thumbKey = `${session.user.id}/${fileId}/thumbnail.png`;
                        const thumbUrl = new URL(`${endpoint}/${bucketName}/${thumbKey}`);
                        thumbUrl.searchParams.set("X-Amz-Expires", "3600");

                        const signedThumb = await r2.sign(thumbUrl, {
                            method: "PUT",
                            aws: { signQuery: true },
                        });

                        thumbnailData = {
                            uploadUrl: signedThumb.url,
                            key: thumbKey,
                        };
                    }

                    return new Response(
                        JSON.stringify({
                            fileId,
                            uploadUrl: signedFile.url,
                            key: fileKey,
                            thumbnail: thumbnailData,
                        }),
                        {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        }
                    );
                } catch (error) {
                    console.error("Presigned URL generation failed:", error);
                    const message =
                        error instanceof Error ? error.message : "Unknown error";
                    return new Response(JSON.stringify({ error: message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },
        },
    },
});
