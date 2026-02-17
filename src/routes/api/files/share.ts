import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileShares, user } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { ulid } from "ulid";
import { logActivity } from "@/lib/activity.server";

// Generate a random share token
function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const Route = createFileRoute("/api/files/share")({
  server: {
    handlers: {
      // Get shares for a file
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
            .select({ id: files.id, userId: files.userId, name: files.name })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

          if (!file.length || file[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get all shares for this file
          const shares = await db
            .select({
              id: fileShares.id,
              shareType: fileShares.shareType,
              permission: fileShares.permission,
              shareToken: fileShares.shareToken,
              expiresAt: fileShares.expiresAt,
              isActive: fileShares.isActive,
              createdAt: fileShares.createdAt,
              sharedWithUserId: fileShares.sharedWithUserId,
              sharedWithUserName: user.name,
              sharedWithUserEmail: user.email,
            })
            .from(fileShares)
            .leftJoin(user, eq(fileShares.sharedWithUserId, user.id))
            .where(eq(fileShares.fileId, fileId));

          // Log activity (every time the share modal is opened/shares are viewed)
          await logActivity({
            db,
            userId: session.user.id,
            action: "file_share",
            entityId: fileId,
            entityType: "file",
            details: { name: file[0].name, type: "view_share_link" },
            request
          });

          return new Response(JSON.stringify({ shares }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error getting shares:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Create a new share
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
          const {
            fileId,
            shareType,
            permission = 'view',
            expiresAt,
            password,
            email // For user-based sharing
          } = body as {
            fileId: string;
            shareType: 'link' | 'user';
            permission?: 'view' | 'edit' | 'admin';
            expiresAt?: number;
            password?: string;
            email?: string;
          };

          if (!fileId || !shareType) {
            return new Response(JSON.stringify({ error: "fileId and shareType are required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Check file ownership
          const file = await db
            .select({ id: files.id, userId: files.userId, name: files.name })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

          if (!file.length || file[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          let sharedWithUserId: string | null = null;
          let shareToken: string | null = null;

          if (shareType === 'user') {
            if (!email) {
              return new Response(JSON.stringify({ error: "Email is required for user sharing." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            // Find user by email
            const targetUser = await db
              .select({ id: user.id })
              .from(user)
              .where(eq(user.email, email))
              .limit(1);

            if (!targetUser.length) {
              return new Response(JSON.stringify({ error: "User not found with this email." }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }

            sharedWithUserId = targetUser[0].id;

            // Check if already shared with this user
            const existingShare = await db
              .select({ id: fileShares.id })
              .from(fileShares)
              .where(and(
                eq(fileShares.fileId, fileId),
                eq(fileShares.sharedWithUserId, sharedWithUserId)
              ))
              .limit(1);

            if (existingShare.length) {
              return new Response(JSON.stringify({ error: "File already shared with this user." }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
              });
            }
          } else {
            // Link-based sharing
            shareToken = generateShareToken();
          }

          const now = new Date();
          const shareId = ulid();

          await db.insert(fileShares).values({
            id: shareId,
            fileId,
            sharedByUserId: session.user.id,
            sharedWithUserId,
            shareType,
            permission,
            shareToken,
            password: password || null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });

          // Log activity
          await logActivity({
            db,
            userId: session.user.id,
            action: "file_share",
            entityId: fileId,
            entityType: "file",
            details: { name: file[0].name, shareType, permission, sharedWithUserId },
            request
          });

          // Build share URL for link shares
          const shareUrl = shareType === 'link'
            ? `${new URL(request.url).origin}/shared/${shareToken}`
            : null;

          return new Response(JSON.stringify({
            success: true,
            shareId,
            shareType,
            shareToken,
            shareUrl,
            message: shareType === 'link'
              ? "Paylaşım linki oluşturuldu."
              : "Dosya kullanıcı ile paylaşıldı."
          }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error creating share:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Update share settings
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
          const { shareId, permission, expiresAt, isActive, password } = body as {
            shareId: string;
            permission?: 'view' | 'edit' | 'admin';
            expiresAt?: number | null;
            isActive?: boolean;
            password?: string | null;
          };

          if (!shareId) {
            return new Response(JSON.stringify({ error: "shareId is required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get share and verify ownership
          const share = await db
            .select({
              id: fileShares.id,
              fileId: fileShares.fileId,
              sharedByUserId: fileShares.sharedByUserId,
            })
            .from(fileShares)
            .where(eq(fileShares.id, shareId))
            .limit(1);

          if (!share.length || share[0].sharedByUserId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Build update object
          const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
          };

          if (permission !== undefined) updateData.permission = permission;
          if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
          if (isActive !== undefined) updateData.isActive = isActive;
          if (password !== undefined) updateData.password = password;

          await db
            .update(fileShares)
            .set(updateData)
            .where(eq(fileShares.id, shareId));

          // Log activity
          await logActivity({
            db,
            userId: session.user.id,
            action: "file_share", // using same action for update
            entityId: share[0].fileId,
            entityType: "file",
            details: { type: "update_share", shareId, ...updateData },
            request
          });

          return new Response(JSON.stringify({
            success: true,
            message: "Paylaşım ayarları güncellendi."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error updating share:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Delete a share
      DELETE: async ({ request }) => {
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
          const shareId = url.searchParams.get('shareId');

          if (!shareId) {
            return new Response(JSON.stringify({ error: "shareId is required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Get share and verify ownership
          const share = await db
            .select({
              id: fileShares.id,
              fileId: fileShares.fileId,
              sharedByUserId: fileShares.sharedByUserId,
            })
            .from(fileShares)
            .where(eq(fileShares.id, shareId))
            .limit(1);

          if (!share.length || share[0].sharedByUserId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          await db.delete(fileShares).where(eq(fileShares.id, shareId));

          // Log activity
          await logActivity({
            db,
            userId: session.user.id,
            action: "file_share",
            entityId: share[0].fileId,
            entityType: "file",
            details: { type: "delete_share", shareId },
            request
          });

          return new Response(JSON.stringify({
            success: true,
            message: "Paylaşım kaldırıldı."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error deleting share:", error);
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
