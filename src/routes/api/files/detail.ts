import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileShares, user, fileComments, fileVersions } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { logActivity } from "@/lib/activity.server";

export const Route = createFileRoute("/api/files/detail")({
  server: {
    handlers: {
      // Get file details
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

          const url = new URL(request.url);
          const fileId = url.searchParams.get('fileId');

          if (!fileId) {
            return new Response(JSON.stringify({ error: "fileId is required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get file details
          const fileData = await db
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
              isDeleted: files.isDeleted,
              ownerName: user.name,
              ownerEmail: user.email,
              ownerImage: user.image,
            })
            .from(files)
            .leftJoin(user, eq(files.userId, user.id))
            .where(eq(files.id, fileId))
            .limit(1);

          if (!fileData.length) {
            return new Response(JSON.stringify({ error: "File not found." }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const file = fileData[0];

          // Check access
          let hasAccess = file.userId === session.user.id;
          let permission: string = 'owner';

          if (!hasAccess) {
            const share = await db
              .select({ id: fileShares.id, permission: fileShares.permission })
              .from(fileShares)
              .where(and(
                eq(fileShares.fileId, fileId),
                eq(fileShares.sharedWithUserId, session.user.id),
                eq(fileShares.isActive, true)
              ))
              .limit(1);

            if (share.length) {
              hasAccess = true;
              permission = share[0].permission;
            }
          }

          if (!hasAccess) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get stats
          const shareCount = await db
            .select({ count: count() })
            .from(fileShares)
            .where(and(eq(fileShares.fileId, fileId), eq(fileShares.isActive, true)));

          const commentCount = await db
            .select({ count: count() })
            .from(fileComments)
            .where(eq(fileComments.fileId, fileId));

          // Log activity
          /* await */ logActivity({
              db,
              userId: session.user.id,
              action: "file_view",
              entityId: fileId,
              entityType: "file",
              details: { name: file.name },
              request
            });

          const versionCount = await db
            .select({ count: count() })
            .from(fileVersions)
            .where(eq(fileVersions.fileId, fileId));

          // Log activity (async, don't block response)
          // Only log if not owner to reduce noise? OR log all views?
          // User asked for "file view" so let's log all checks.
          // Ideally we should check if user already viewed it recently to avoid spam, but for now log every hit.
          /* await */ logActivity({
              db,
              userId: session.user.id,
              action: "file_view",
              entityId: fileId,
              entityType: "file",
              details: { name: file.name },
              request
            });

          return new Response(JSON.stringify({
            file,
            permission,
            isOwner: file.userId === session.user.id,
            stats: {
              shareCount: shareCount[0]?.count || 0,
              commentCount: commentCount[0]?.count || 0,
              versionCount: (versionCount[0]?.count || 0) + 1,
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error fetching file details:", error);
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
