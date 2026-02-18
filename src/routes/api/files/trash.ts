import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, user } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity.server";

export const Route = createFileRoute("/api/files/trash")({
    server: {
        handlers: {
            // Get all files in trash for current user
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

                    // Get trashed files
                    const trashedFiles = await db
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
                            deletedAt: files.deletedAt,
                            userName: user.name,
                            permission: sql<string>`'admin'`,
                        })
                        .from(files)
                        .leftJoin(user, eq(files.userId, user.id))
                        .where(and(
                            eq(files.userId, session.user.id),
                            eq(files.isDeleted, true)
                        ))
                        .orderBy(desc(files.deletedAt));

                    return new Response(JSON.stringify({ files: trashedFiles }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error fetching trashed files:", error);
                    const message = error instanceof Error ? error.message : "Unknown error";
                    return new Response(JSON.stringify({ error: message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },

            // Move file to trash (soft delete)
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

                    // Soft delete
                    await db
                        .update(files)
                        .set({
                            isDeleted: true,
                            deletedAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(files.id, fileId));

                    // Log activity
                    await logActivity({
                        db,
                        userId: session.user.id,
                        action: "file_delete",
                        entityId: fileId,
                        entityType: "file",
                        details: { type: "soft_delete", name: file[0].name },
                        request
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        message: "File moved to trash."
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error moving file to trash:", error);
                    const message = error instanceof Error ? error.message : "Unknown error";
                    return new Response(JSON.stringify({ error: message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },

            // Restore file from trash
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
                    const { fileId } = body as { fileId: string };

                    if (!fileId) {
                        return new Response(JSON.stringify({ error: "fileId is required." }), {
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

                    // Restore from trash
                    await db
                        .update(files)
                        .set({
                            isDeleted: false,
                            deletedAt: null,
                            updatedAt: new Date(),
                        })
                        .where(eq(files.id, fileId));

                    // Log activity
                    await logActivity({
                        db,
                        userId: session.user.id,
                        action: "file_edit", // restoring is technically an edit
                        entityId: fileId,
                        entityType: "file",
                        details: { type: "restore_from_trash", name: file[0].name },
                        request
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        message: "File restored from trash."
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error restoring file:", error);
                    const message = error instanceof Error ? error.message : "Unknown error";
                    return new Response(JSON.stringify({ error: message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            },

            // Permanently delete file
            DELETE: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    const r2 = env?.R2_FILES_BUCKET;

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

                    const url = new URL(request.url);
                    const fileId = url.searchParams.get('fileId');

                    if (!fileId) {
                        return new Response(JSON.stringify({ error: "fileId is required." }), {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        });
                    }

                    // Check if file exists and user owns it
                    const file = await db
                        .select({ id: files.id, userId: files.userId, r2Key: files.r2Key })
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

                    // Delete from R2 if bucket is available
                    if (r2 && file[0].r2Key) {
                        try {
                            await r2.delete(file[0].r2Key);
                        } catch (r2Error) {
                            console.error("Error deleting from R2:", r2Error);
                            // Continue with DB deletion even if R2 fails
                        }
                    }

                    // Log activity (before delete so we have record)
                    await logActivity({
                        db,
                        userId: session.user.id,
                        action: "file_delete",
                        entityId: fileId,
                        entityType: "file",
                        details: { type: "permanent_delete", name: file[0].r2Key }, // r2Key often contains name
                        request
                    });

                    // Permanently delete from database
                    await db.delete(files).where(eq(files.id, fileId));

                    return new Response(JSON.stringify({
                        success: true,
                        message: "File permanently deleted."
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error) {
                    console.error("Error permanently deleting file:", error);
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
