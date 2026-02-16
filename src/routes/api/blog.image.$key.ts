import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/blog/image/$key")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                try {
                    const R2Bucket = env?.R2_FILES_BUCKET;
                    if (!R2Bucket) {
                        return new Response("R2 not configured", { status: 500 });
                    }

                    // The key is URL-encoded (slashes as %2F), decode it to get the R2 key
                    const r2Key = decodeURIComponent(params.key);

                    if (!r2Key || !r2Key.startsWith("blog/")) {
                        return new Response("Not found", { status: 404 });
                    }

                    const object = await R2Bucket.get(r2Key);
                    if (!object) {
                        return new Response("Not found", { status: 404 });
                    }

                    const headers = new Headers();
                    headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
                    headers.set("Cache-Control", "public, max-age=31536000, immutable");
                    headers.set("ETag", object.httpEtag);

                    return new Response(object.body as ReadableStream, { headers });
                } catch (error) {
                    console.error("Image serve error:", error);
                    return new Response("Error", { status: 500 });
                }
            },
        },
    },
});
