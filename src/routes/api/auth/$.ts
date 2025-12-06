import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            return new Response(JSON.stringify({ error: "Database not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env, request.url);
          return await auth.handler(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            return new Response(JSON.stringify({ error: "Database not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env, request.url);
          return await auth.handler(request);
        } catch (error) {
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
