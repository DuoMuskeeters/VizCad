import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";

export const Route = createFileRoute("/api/files/complete-upload")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;

                    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
                        return new Response(JSON.stringify({
                            error: "R2 Credentials missing. Check Cloudflare Dashboard."
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
                        fileId: string;
                        name: string;
                        size: number;
                        type: string;
                        key: string;
                        thumbnailKey?: string | null;
                    };

                    if (!body.fileId || !body.key) {
                        return new Response(
                            JSON.stringify({ error: "Missing completion data" }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    const db = getDb(d1);

                    // Create DB entry
                    const [insertedFile] = await db
                        .insert(files)
                        .values({
                            id: body.fileId,
                            name: body.name,
                            r2Key: body.key,
                            size: body.size,
                            mimeType: body.type,
                            extension: body.name.split(".").pop()?.toLowerCase() || "",
                            status: "uploaded",
                            userId: session.user.id,
                            thumbnailR2Key: body.thumbnailKey || null,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .returning();

                    return new Response(JSON.stringify(insertedFile), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Complete upload failed:", error);
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
