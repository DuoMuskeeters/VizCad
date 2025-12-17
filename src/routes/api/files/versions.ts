import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileVersions, user } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ulid } from "ulid";

export const Route = createFileRoute("/api/files/versions")({
  server: {
    handlers: {
      // Get version history
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

          // Check file ownership
          const file = await db
            .select({ id: files.id, userId: files.userId, name: files.name, r2Key: files.r2Key, size: files.size, createdAt: files.createdAt })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

          if (!file.length || file[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get version history
          const versions = await db
            .select({
              id: fileVersions.id,
              versionNumber: fileVersions.versionNumber,
              r2Key: fileVersions.r2Key,
              size: fileVersions.size,
              changeNote: fileVersions.changeNote,
              uploadedByUserId: fileVersions.uploadedByUserId,
              uploadedByUserName: user.name,
              createdAt: fileVersions.createdAt,
            })
            .from(fileVersions)
            .leftJoin(user, eq(fileVersions.uploadedByUserId, user.id))
            .where(eq(fileVersions.fileId, fileId))
            .orderBy(desc(fileVersions.versionNumber));

          // Add current version as v1 if no versions exist
          const currentVersion = {
            id: 'current',
            versionNumber: versions.length + 1,
            r2Key: file[0].r2Key,
            size: file[0].size,
            changeNote: 'İlk versiyon',
            uploadedByUserId: session.user.id,
            uploadedByUserName: session.user.name,
            createdAt: file[0].createdAt,
            isCurrent: true,
          };

          return new Response(JSON.stringify({
            versions: [currentVersion, ...versions.map((v) => ({ ...v, isCurrent: false }))]
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error fetching versions:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Upload new version
      POST: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;
          const R2Bucket = env?.R2_FILES_BUCKET;

          if (!d1 || !R2Bucket) {
            return new Response(
              JSON.stringify({ error: "Cloudflare bindings not configured." }),
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

          const formData = await request.formData();
          const file = formData.get("file");
          const fileId = formData.get("fileId") as string;
          const changeNote = formData.get("changeNote") as string || "";

          if (!(file instanceof File) || !fileId) {
            return new Response(
              JSON.stringify({ error: "File and fileId are required." }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // Check file ownership
          const existingFile = await db
            .select({ id: files.id, userId: files.userId, r2Key: files.r2Key, size: files.size })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

          if (!existingFile.length || existingFile[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get current version count
          const versionCountResult = await db
            .select({ id: fileVersions.id })
            .from(fileVersions)
            .where(eq(fileVersions.fileId, fileId));

          const nextVersionNumber = versionCountResult.length + 1;

          // Save current version to history before updating
          const versionId = ulid();
          await db.insert(fileVersions).values({
            id: versionId,
            fileId,
            versionNumber: nextVersionNumber,
            r2Key: existingFile[0].r2Key,
            size: existingFile[0].size,
            changeNote: changeNote || `Versiyon ${nextVersionNumber}`,
            uploadedByUserId: session.user.id,
            createdAt: new Date(),
          });

          // Upload new file to R2
          const newR2Key = `${session.user.id}/${fileId}/v${nextVersionNumber + 1}/${file.name}`;
          await R2Bucket.put(newR2Key, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type },
          });

          // Update current file
          await db
            .update(files)
            .set({
              r2Key: newR2Key,
              size: file.size,
              name: file.name,
              mimeType: file.type,
              updatedAt: new Date(),
            })
            .where(eq(files.id, fileId));

          return new Response(JSON.stringify({
            success: true,
            versionNumber: nextVersionNumber + 1,
            message: "Yeni versiyon yüklendi."
          }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error uploading version:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Rollback to a previous version
      PATCH: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            return new Response(
              JSON.stringify({ error: "Cloudflare bindings not configured." }),
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
          const { fileId, versionId } = body as { fileId: string; versionId: string };

          if (!fileId || !versionId) {
            return new Response(JSON.stringify({ error: "fileId and versionId are required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Check file ownership
          const file = await db
            .select({ id: files.id, userId: files.userId, r2Key: files.r2Key, size: files.size })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

          if (!file.length || file[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get target version
          const version = await db
            .select({ id: fileVersions.id, r2Key: fileVersions.r2Key, size: fileVersions.size, versionNumber: fileVersions.versionNumber })
            .from(fileVersions)
            .where(eq(fileVersions.id, versionId))
            .limit(1);

          if (!version.length) {
            return new Response(JSON.stringify({ error: "Version not found." }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Save current version to history
          const versionCountResult = await db
            .select({ id: fileVersions.id })
            .from(fileVersions)
            .where(eq(fileVersions.fileId, fileId));

          const newVersionId = ulid();
          await db.insert(fileVersions).values({
            id: newVersionId,
            fileId,
            versionNumber: versionCountResult.length + 1,
            r2Key: file[0].r2Key,
            size: file[0].size,
            changeNote: `Versiyon ${version[0].versionNumber} geri yüklendi`,
            uploadedByUserId: session.user.id,
            createdAt: new Date(),
          });

          // Update current file to target version
          await db
            .update(files)
            .set({
              r2Key: version[0].r2Key,
              size: version[0].size,
              updatedAt: new Date(),
            })
            .where(eq(files.id, fileId));

          return new Response(JSON.stringify({
            success: true,
            message: `Versiyon ${version[0].versionNumber} geri yüklendi.`
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error rolling back version:", error);
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
