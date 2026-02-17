import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity.server";

export const Route = createFileRoute("/api/files/rename")({
    server: {
        handlers: {
            // Rename a file
            PATCH: async ({ request }) => {
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

                    const body = await request.json();
                    const { fileId, newName } = body as { fileId: string; newName: string };

                    if (!fileId || !newName) {
                        return new Response(JSON.stringify({ error: "fileId and newName are required." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Validate new name
                    const trimmedName = newName.trim();
                    if (trimmedName.length === 0) {
                        return new Response(JSON.stringify({ error: "File name cannot be empty." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    if (trimmedName.length > 255) {
                        return new Response(JSON.stringify({ error: "File name too long (max 255 characters)." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Check if file exists and user owns it
                    const file = await db
                        .select({ id: files.id, userId: files.userId, name: files.name })
                        .from(files)
                        .where(eq(files.id, fileId))
                        .limit(1);

                    if (!file.length) {
                        return new Response(JSON.stringify({ error: "File not found." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    if (file[0].userId !== session.user.id) {
                        return new Response(JSON.stringify({ error: "Access denied." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Update file name
                    await db
                        .update(files)
                        .set({
                            name: trimmedName,
                            updatedAt: new Date(),
                        })
                        .where(eq(files.id, fileId));

                    // Log activity
                    await logActivity({
                        db,
                        userId: session.user.id,
                        action: "file_rename",
                        entityId: fileId,
                        entityType: "file",
                        details: { oldName: file[0].name, newName: trimmedName }, // need to fetch old name properly if not available, but 'file' query has it
                        request
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        newName: trimmedName,
                        message: "File renamed successfully."
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error renaming file:", error);
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
