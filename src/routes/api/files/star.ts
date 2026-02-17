import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileStars } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { logActivity } from "@/lib/activity.server";

export const Route = createFileRoute("/api/files/star")({
    server: {
        handlers: {
            // Toggle star status for a file
            POST: async ({ request }) => {
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
                    const { fileId } = body as { fileId: string };

                    if (!fileId) {
                        return new Response(JSON.stringify({ error: "fileId is required." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Check if file exists and user has access
                    const file = await db
                        .select({ id: files.id, userId: files.userId })
                        .from(files)
                        .where(eq(files.id, fileId))
                        .limit(1);

                    if (!file.length) {
                        return new Response(JSON.stringify({ error: "File not found." }), {
                            status: 404,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Check if file is owned by user or shared with user (for now, only owner)
                    if (file[0].userId !== session.user.id) {
                        return new Response(JSON.stringify({ error: "Access denied." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Check if star already exists
                    const existingStar = await db
                        .select({ id: fileStars.id })
                        .from(fileStars)
                        .where(and(
                            eq(fileStars.fileId, fileId),
                            eq(fileStars.userId, session.user.id)
                        ))
                        .limit(1);

                    if (existingStar.length > 0) {
                        // Remove star (toggle off)
                        await db.delete(fileStars).where(eq(fileStars.id, existingStar[0].id));

                        // Log activity
                        await logActivity({
                            db,
                            userId: session.user.id,
                            action: "file_star", // or 'file_unstar' if we want detailed distinction, but 'star' with details is fine
                            entityId: fileId,
                            entityType: "file",
                            details: { starred: false },
                            request
                        });

                        return new Response(JSON.stringify({
                            success: true,
                            starred: false,
                            message: "Star removed."
                        }), {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        });
                    } else {
                        // Add star (toggle on)
                        await db.insert(fileStars).values({
                            id: ulid(),
                            fileId,
                            userId: session.user.id,
                            createdAt: new Date(),
                        });

                        // Log activity
                        await logActivity({
                            db,
                            userId: session.user.id,
                            action: "file_star",
                            entityId: fileId,
                            entityType: "file",
                            details: { starred: true },
                            request
                        });

                        return new Response(JSON.stringify({
                            success: true,
                            starred: true,
                            message: "Star added."
                        }), {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        });
                    }
                } catch (error) {
                    console.error("Error toggling star:", error);
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
