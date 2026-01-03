import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";
import { ulid } from "ulid";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";

export const Route = createFileRoute("/api/files/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;
          const R2Bucket = env?.R2_FILES_BUCKET;

          if (!d1 || !R2Bucket) {
            return new Response(
              JSON.stringify({
                error: "Cloudflare bindings (D1 or R2) not configured.",
              }),
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

          if (!(file instanceof File)) {
            return new Response(
              JSON.stringify({ error: "File not provided in form data." }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          const fileId = ulid();
          const r2Key = `${session.user.id}/${fileId}/${file.name}`;

          const thumbnail = formData.get("thumbnail");
          let thumbnailKey = null;

          if (typeof thumbnail === "string" && thumbnail.startsWith("data:image")) {
            try {
              const base64Data = thumbnail.split(",")[1];
              // Cloudflare Workers environment supports atob
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              thumbnailKey = `${session.user.id}/${fileId}/thumbnail.png`;
              await R2Bucket.put(thumbnailKey, bytes.buffer, {
                httpMetadata: { contentType: "image/png" }
              });
            } catch (error) {
              console.error("Thumbnail upload failed:", error);
              // Continue upload even if thumbnail fails
            }
          }

          // Upload the file to R2
          await R2Bucket.put(r2Key, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type },
          });

          // Create an entry in the database
          const [insertedFile] = await db
            .insert(files)
            .values({
              id: fileId,
              name: file.name,
              r2Key: r2Key,
              size: file.size,
              mimeType: file.type,
              extension: file.name.split(".").pop() || "",
              status: "uploaded", // Directly mark as uploaded
              userId: session.user.id,
              thumbnailR2Key: thumbnailKey,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          return new Response(JSON.stringify(insertedFile), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error during direct file upload:", error);
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
