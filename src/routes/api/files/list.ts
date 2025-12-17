import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, user } from "@/db/schema";
import { eq, and, sql, sum } from "drizzle-orm"; // Import sum and sql

export const Route = createFileRoute("/api/files/list")({
  server: {
    handlers: {
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

          // Fetch user's files (excluding soft-deleted)
          const userFiles = await db
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
              thumbnailR2Key: files.thumbnailR2Key,
              userName: user.name,
            })
            .from(files)
            .leftJoin(user, eq(files.userId, user.id))
            .where(and(
              eq(files.userId, session.user.id),
              eq(files.status, 'uploaded'),
              eq(files.isDeleted, false)
            ));

          // Calculate total used storage for the user (excluding soft-deleted)
          const totalSizeResult = await db
            .select({
              totalBytes: sql<number>`sum(${files.size})`.as('totalBytes'),
            })
            .from(files)
            .where(and(
              eq(files.userId, session.user.id),
              eq(files.status, 'uploaded'),
              eq(files.isDeleted, false)
            ));

          const usedBytes = totalSizeResult[0]?.totalBytes || 0;

          // Fetch user's storage quota
          const currentUser = await db.select({
            storageQuotaGb: user.storageQuotaGb
          }).from(user).where(eq(user.id, session.user.id)).limit(1);

          const quotaGb = currentUser[0]?.storageQuotaGb || 0; // Default to 0 if not found
          const quotaBytes = quotaGb * 1024 * 1024 * 1024; // Convert GB to Bytes

          return new Response(JSON.stringify({
            files: userFiles,
            storageSummary: {
              usedBytes,
              quotaGb,
              quotaBytes,
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error fetching file list and storage summary:", error);
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
