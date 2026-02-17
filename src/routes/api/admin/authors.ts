import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { authorProfiles, user } from "@/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/authors")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
                    const db = getDb(d1);

                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    // Admin check
                    if (!session || !session.user || (session.user as any).role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
                    }

                    const profiles = await db.select({
                        userId: user.id,
                        userName: user.name,
                        userEmail: user.email,
                        authorName: authorProfiles.name,
                        authorBio: authorProfiles.bio,
                        authorRole: authorProfiles.role,
                        authorAvatar: authorProfiles.avatarUrl,
                    })
                        .from(user)
                        .leftJoin(authorProfiles, eq(user.id, authorProfiles.userId))
                        .where(eq(user.role, "admin"))
                        .all();

                    return new Response(JSON.stringify({ profiles }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error: any) {
                    console.error("Fetch authors error:", error);
                    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                }
            },
            POST: async ({ request }) => {
                try {
                    const d1 = env?.vizcad_auth;
                    if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
                    const db = getDb(d1);

                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);

                    // Admin check
                    if (!session || !session.user || (session.user as any).role !== "admin") {
                        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
                    }

                    const data = await request.json() as any;
                    const { userId, name, bio, role, avatarUrl } = data;

                    if (!userId) {
                        return new Response(JSON.stringify({ error: "User ID is required" }), { status: 400 });
                    }

                    // Verify that the target user is an admin
                    const targetUser = await db.select().from(user).where(eq(user.id, userId)).get();
                    if (!targetUser || targetUser.role !== "admin") {
                        return new Response(JSON.stringify({ error: "Only administrators can have author profiles." }), { status: 403 });
                    }

                    const existing = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId)).get();

                    if (existing) {
                        await db.update(authorProfiles).set({
                            name,
                            bio,
                            role,
                            avatarUrl,
                            updatedAt: new Date(),
                        }).where(eq(authorProfiles.userId, userId));
                    } else {
                        await db.insert(authorProfiles).values({
                            id: crypto.randomUUID(),
                            userId,
                            name,
                            bio,
                            role,
                            avatarUrl,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }

                    return new Response(JSON.stringify({ success: true }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (error: any) {
                    console.error("Update author error:", error);
                    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                }
            },
        },
    },
});
