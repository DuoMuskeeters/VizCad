import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";

const slugifyFilename = (name: string) => {
    const ext = name.split(".").pop() || "";
    const base = name.replace(/\.[^/.]+$/, ""); // remove extension
    const slugged = base
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${slugged}.${ext}`;
};

export const Route = createFileRoute("/api/blog/upload")({
    server: {
        handlers: {
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

                    // Auth check
                    const auth = getAuth(d1, env, request.url);
                    const session = await auth.api.getSession(request);
                    if (!session || session.user.role !== "admin") {
                        return new Response(
                            JSON.stringify({ error: "Unauthorized" }),
                            { status: 401, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    const formData = await request.formData();
                    const file = formData.get("file");
                    const blogSlug = formData.get("slug") as string | null;

                    if (!(file instanceof File)) {
                        return new Response(
                            JSON.stringify({ error: "No file provided" }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    // Validate file type
                    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
                    if (!allowedTypes.includes(file.type)) {
                        return new Response(
                            JSON.stringify({ error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, SVG" }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }

                    // Build R2 key: blog/{slug}/{safe-filename}
                    const safeFilename = slugifyFilename(file.name);
                    const folder = blogSlug || "general";
                    const r2Key = `blog/${folder}/${safeFilename}`;

                    // Upload to R2
                    await R2Bucket.put(r2Key, await file.arrayBuffer(), {
                        httpMetadata: { contentType: file.type },
                    });

                    // URL-encode the key so slashes become %2F (single path segment for $key param)
                    const url = `/api/blog/image/${encodeURIComponent(r2Key)}`;

                    return new Response(
                        JSON.stringify({ url, key: r2Key, filename: safeFilename }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                } catch (error) {
                    console.error("Blog image upload error:", error);
                    const message = error instanceof Error ? error.message : "Unknown error";
                    return new Response(
                        JSON.stringify({ error: message }),
                        { status: 500, headers: { "Content-Type": "application/json" } }
                    );
                }
            },
        },
    },
});
