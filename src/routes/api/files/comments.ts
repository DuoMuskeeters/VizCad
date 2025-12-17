import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { files, fileComments, user, fileShares } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ulid } from "ulid";

export const Route = createFileRoute("/api/files/comments")({
  server: {
    handlers: {
      // Get comments for a file
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

          // Get comments
          const comments = await db
            .select({
              id: fileComments.id,
              content: fileComments.content,
              parentId: fileComments.parentId,
              userId: fileComments.userId,
              userName: user.name,
              userImage: user.image,
              createdAt: fileComments.createdAt,
              updatedAt: fileComments.updatedAt,
            })
            .from(fileComments)
            .leftJoin(user, eq(fileComments.userId, user.id))
            .where(eq(fileComments.fileId, fileId))
            .orderBy(desc(fileComments.createdAt));

          return new Response(JSON.stringify({ comments }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error fetching comments:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Add a comment
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
          const { fileId, content, parentId } = body as {
            fileId: string;
            content: string;
            parentId?: string;
          };

          if (!fileId || !content?.trim()) {
            return new Response(JSON.stringify({ error: "fileId and content are required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const now = new Date();
          const commentId = ulid();

          await db.insert(fileComments).values({
            id: commentId,
            fileId,
            userId: session.user.id,
            parentId: parentId || null,
            content: content.trim(),
            createdAt: now,
            updatedAt: now,
          });

          return new Response(JSON.stringify({
            success: true,
            commentId,
            message: "Yorum eklendi."
          }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error adding comment:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      // Delete a comment
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
          const commentId = url.searchParams.get('commentId');

          if (!commentId) {
            return new Response(JSON.stringify({ error: "commentId is required." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Verify ownership
          const comment = await db
            .select({ id: fileComments.id, userId: fileComments.userId })
            .from(fileComments)
            .where(eq(fileComments.id, commentId))
            .limit(1);

          if (!comment.length || comment[0].userId !== session.user.id) {
            return new Response(JSON.stringify({ error: "Access denied." }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Delete the comment and its replies
          await db.delete(fileComments).where(eq(fileComments.parentId, commentId));
          await db.delete(fileComments).where(eq(fileComments.id, commentId));

          return new Response(JSON.stringify({
            success: true,
            message: "Yorum silindi."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error deleting comment:", error);
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
