import { createFileRoute } from "@tanstack/react-router";
import { getPostBySlug } from "@/lib/blog.server";

export const Route = createFileRoute("/api/blog/slug/$slug")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const { slug } = params;
                try {
                    const result = await getPostBySlug(slug);
                    return new Response(JSON.stringify(result), {
                        headers: { "Content-Type": "application/json" }
                    });
                } catch (e: any) {
                    return new Response(JSON.stringify({ error: e.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }
        }
    }
});
